"use server"

import { revalidatePath } from "next/cache";
import { connectToDB } from "@/lib/mongoose";

import User from "@/lib/models/user.model";
import Thread from "@/lib/models/thread.model";
import Community from "@/lib/models/community.model";

type Params = {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
};

export async function createThread({ text, author, communityId, path }: Params) {
  try {
    connectToDB();

    const communityIdObject = await Community.findOne(
      { id: communityId },
    );

    const createdThread = await Thread.create({
      text,
      author,
      community: communityIdObject,
    });

    // Update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });

    if (communityIdObject) {
      // Update Community model
      await Community.findByIdAndUpdate(communityIdObject, {
        $push: { threads: createdThread._id },
      });
    }

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Error creating thread: ${error.message}`)
  }
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  try {
    connectToDB();

    // Calculate the number of posts to skip
    const skipAmount = (pageNumber - 1) * pageSize

    // fetch posts that have no parents (top-level threads...)
    const postsQuery = Thread
    .find({ 
      parentId: { 
        $in: [null, undefined] 
      } 
    })
    .sort({ createdAt: 'desc' })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({
      path: 'author',
      model: User
    })
    .populate({
      path: "community",
      model: Community,
    })
    .populate({
      path: 'children',
      populate: {
        path: "author", // Populate the author field within children
        model: User,
        select: "_id name parentId image", // Select only _id and username fields of the author
      },
    })

    const totalPostsCount = await Thread
    .countDocuments({
      parentId: {
        $in: [null, undefined]
      }
    })
    
    const posts = await postsQuery.exec();

    const isNext = totalPostsCount > skipAmount + posts.length;

    return { posts, isNext }

  } catch (error) {

  }
}

export async function fetchThreadById(id: string) {
  try {
    connectToDB();
    
    // TODO: populate community
    const thread = await Thread
    .findById(id)
    .populate({
      path: 'author',
      model: User,
      select: "_id id name image"
    })
    .populate({
      path: "community",
      model: Community,
      select: "_id id name image",
    }) // Populate the community field with _id and name
    .populate({
      path: 'children',
      populate: [
        {
          path: 'author',
          model: User,
          select: "_id id parentId image"
        },
        {
          path: 'children',
          model: Thread,
          populate: {
            path: 'author',
            model: User,
            select: "_id id parentId image"
          }
        }
      ]
    }).exec()

    return thread;

  } catch (error: any) {
    throw new Error(`Error fetching thread: ${error.message}`)
  }
}

export async function addCommentToThread({
  threadId,
  commentText,
  userId,
  path
}: {
  threadId: string,
  commentText: string,
  userId: string,
  path: string,
}) {

  try {
    connectToDB();

    // Find the original thread by it's ID
    const originalThread = await Thread.findById(threadId);

    if (!originalThread) {
      throw new Error(`Thread not found`)
    }

    // Create a new thread with the new text

    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId
    })

    // Save the new thread
    const savedCommentThread = await commentThread.save()

    originalThread.children.push(savedCommentThread._id);

    await originalThread.save();

    revalidatePath(path);

  } catch(error: any) {
    throw new Error(`Error adding comment to the thread: ${error.message}`)
  }

}
