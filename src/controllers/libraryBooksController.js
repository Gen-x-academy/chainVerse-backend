const Book = require('../models/book');
const Borrow = require('../models/Borrow');
const Course = require('../models/course');
const NodeCache = require('node-cache');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Cache popular queries for 2 minutes
const libraryBooksCache = new NodeCache({ stdTTL: 120 });

const handleError = (res, statusCode, message, errors = undefined) => {
  const payload = { success: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

const handleSuccess = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const escapeRegex = (value) => {
  // Escape regex special chars to avoid ReDoS / unexpected patterns
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const parseCsv = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

async function getCourseRecommendedBookIds(courseId) {
  const course = await Course.findById(courseId)
    .select('recommendedBooks videos.recommendedBooks')
    .lean();
  if (!course) return null;

  const ids = new Set();
  if (Array.isArray(course.recommendedBooks)) {
    for (const item of course.recommendedBooks) {
      if (item?.book) ids.add(String(item.book));
    }
  }
  if (Array.isArray(course.videos)) {
    for (const video of course.videos) {
      if (!Array.isArray(video?.recommendedBooks)) continue;
      for (const item of video.recommendedBooks) {
        if (item?.book) ids.add(String(item.book));
      }
    }
  }
  return Array.from(ids);
}

/**
 * GET /api/library/books
 * Public endpoint: browse/search/filter books with pagination.
 */
exports.listLibraryBooks = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return handleError(res, 400, 'Validation failed', errors.array());
  }

  try {
    const {
      search,
      title,
      author,
      category,
      tags,
      topic,
      courseId,
      sort = search ? 'relevance' : 'recent',
      page = 1,
      limit = 10,
    } = req.query;

    // Build match filter (public-safe)
    const match = {};

    // Intersección: courseId limita primero, luego demás filtros
    if (courseId) {
      const recommendedIds = await getCourseRecommendedBookIds(courseId);
      if (recommendedIds === null) {
        return handleError(res, 404, 'Course not found');
      }
      match._id = {
        $in: recommendedIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (category) {
      match.category = String(category);
    }

    const tagList = [
      ...parseCsv(tags),
      ...(topic ? [String(topic).trim()] : []),
    ].filter(Boolean);
    if (tagList.length > 0) {
      // OR semantics
      match.tags = { $in: tagList };
    }

    // Full-text search (preferred)
    const useTextSearch = Boolean(search && String(search).trim());
    if (useTextSearch) {
      match.$text = { $search: String(search).trim() };
    } else {
      // Optional explicit field filters (regex, escaped)
      if (title) match.title = { $regex: escapeRegex(title), $options: 'i' };
      if (author) match.author = { $regex: escapeRegex(author), $options: 'i' };
    }

    const safeProjection = {
      title: 1,
      author: 1,
      description: 1,
      coverImage: 1,
      link: 1,
      isbn: 1,
      tags: 1,
      category: 1,
      createdAt: 1,
    };

    // Cache only “popular” (and optionally recent) queries to meet requirement
    const cacheKey = `library_books:${JSON.stringify({
      search: search || null,
      title: title || null,
      author: author || null,
      category: category || null,
      tags: tags || null,
      topic: topic || null,
      courseId: courseId || null,
      sort,
      page: Number(page),
      limit: Number(limit),
    })}`;

    if (sort === 'popular') {
      const cached = libraryBooksCache.get(cacheKey);
      if (cached) {
        return handleSuccess(res, 200, 'Books retrieved successfully (cache)', cached);
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const pipeline = [{ $match: match }];

    // Relevance sorting for text search
    if (sort === 'relevance' && useTextSearch) {
      pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
    }

    // Popular: join borrow counts from Borrow (resourceType='book')
    if (sort === 'popular') {
      pipeline.push(
        {
          $lookup: {
            from: Borrow.collection.name,
            let: { bookId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$resourceId', '$$bookId'] },
                      { $eq: ['$resourceType', 'book'] },
                    ],
                  },
                },
              },
              { $count: 'count' },
            ],
            as: 'borrowStats',
          },
        },
        {
          $addFields: {
            borrowCount: {
              $ifNull: [{ $arrayElemAt: ['$borrowStats.count', 0] }, 0],
            },
          },
        },
      );
    }

    // Projection (public fields)
    pipeline.push({
      $project: sort === 'popular' ? { ...safeProjection, borrowCount: 1 } : safeProjection,
    });

    // Sorting
    if (sort === 'popular') {
      pipeline.push({ $sort: { borrowCount: -1, createdAt: -1, _id: 1 } });
    } else if (sort === 'relevance' && useTextSearch) {
      pipeline.push({ $sort: { score: -1, createdAt: -1, _id: 1 } });
    } else {
      // recent (default)
      pipeline.push({ $sort: { createdAt: -1, _id: 1 } });
    }

    // Pagination + total via facet
    pipeline.push({
      $facet: {
        books: [{ $skip: skip }, { $limit: Number(limit) }],
        total: [{ $count: 'count' }],
      },
    });

    const [result] = await Book.aggregate(pipeline);
    const books = result?.books || [];
    const total = result?.total?.[0]?.count || 0;

    const response = {
      books,
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      totalBooks: total,
    };

    if (sort === 'popular') {
      libraryBooksCache.set(cacheKey, response);
    }

    return handleSuccess(res, 200, 'Books retrieved successfully', response);
  } catch (error) {
    console.error('Error retrieving library books:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

