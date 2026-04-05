import { Router } from "express";
import { db } from "@workspace/db";
import { blogPostsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/blog", async (req, res) => {
  try {
    const { category } = req.query;
    let posts;
    if (category && typeof category === "string") {
      posts = await db.select().from(blogPostsTable)
        .where(eq(blogPostsTable.category, category))
        .orderBy(desc(blogPostsTable.publishedAt));
    } else {
      posts = await db.select().from(blogPostsTable)
        .orderBy(desc(blogPostsTable.publishedAt));
    }
    res.json(posts);
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

router.get("/blog/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [post] = await db.select().from(blogPostsTable)
      .where(eq(blogPostsTable.slug, slug));
    if (!post) {
      return res.status(404).json({ error: "Blog post not found" });
    }
    res.json(post);
  } catch (error) {
    console.error("Error fetching blog post:", error);
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
});

export default router;
