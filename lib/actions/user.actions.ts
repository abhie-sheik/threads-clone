"use server"

import { revalidatePath } from "next/cache";
import { connectToDB } from "@/lib/mongoose"

import User from "@/lib/models/user.model";
import Thread from "@/lib/models/thread.model";
import Community from "@/lib/models/community.model";

import type { FilterQuery, SortOrder } from "mongoose";

type Params = {
  userId: string,
  username: string,
  name: string,
  image: string,
  bio: string,
  path: string,
};

export async function updateUser({
  userId,
  bio,
  name,
  path,
  username,
  image,
}: Params): Promise<void> {
  try {
    connectToDB();

    await User.findOneAndUpdate(
      { id: userId },
      {
        username: username.toLowerCase(),
        name,
        bio,
        image,
        onboarded: true,
      },
      { upsert: true }
    );

    if (path === "/profile/edit") {
      revalidatePath(path);
    }
  } catch (error: any) {
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
}

export async function fetchUser(userId: string) {
  try {
    connectToDB();

    return await User
      .findOne({ id: userId })
      // .populate({ 'communities', model: Community })
  } catch (error: any) {
    throw new Error(`Failed to fetch user: ${error.message}`)
  }
}

export async function fetchUsers({
  userId,
  searchString = "",
  pageNumber = 1,
  pageSize = 20,
  sortBy = 'desc'
}: {
  userId: string;
  searchString?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: SortOrder;
}) {
  try {
    connectToDB()

    const skipAmount = (pageNumber - 1) * pageSize

    const regex = new RegExp(searchString, "i");

    const query: FilterQuery<typeof User> = {
      id: { $ne: userId }
    }

    if (searchString.trim() !== '') {
      query.$or = [
        { username: { $regex: regex } },
        { name: { $regex: regex } }
      ]
    }

    const sortOptions = { createdAt: sortBy };

    const usersQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize);

    const totalUserCount = await User.countDocuments(query);

    const users = await usersQuery.exec();

    const isNext = totalUserCount > skipAmount + users.length

    return { users, isNext }

  } catch(error: any) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }
}

export async function getActivity(userId: string) {
  try {
    connectToDB();

    // find all the threads created by the user
    const userThreads = await Thread.find({ author: userId });

    // Collect all the replies (child thread ids) from the children field

    const childThreadIds = userThreads.reduce((acc, userThread) => {
      return acc.concat(userThread.children)
    }, [])

    const replies = await Thread.find({
      _id: { $in: childThreadIds },
      author: { $ne: userId }
    }).populate({
      path: 'author',
      model: User,
      select: "name image _id"
    });

    return replies;

  } catch(error: any) {
    throw new Error(`Failed to fetch activity: ${error.message}`)
  }
}

export async function fetchUserPosts(userId: string) {
  try {
    connectToDB();

    // Find all threads authored by user with the given userId
    const threads = await User.findOne({
      id: userId
    })
    .populate({
      path: 'threads',
      model: Thread,
      populate: [
        {
          path: "community",
          model: Community,
          select: "name id image _id", // Select the "name" and "_id" fields from the "Community" model
        },
        {
          path: "children",
          model: Thread,
          populate: {
            path: "author",
            model: User,
            select: "name image id", // Select the "name" and "_id" fields from the "User" model
          },
        },
      ],
    })

    return threads;
  } catch (error: any) {
    throw new Error(`Failed to fetch posts: ${error.message}`)
  }
}
