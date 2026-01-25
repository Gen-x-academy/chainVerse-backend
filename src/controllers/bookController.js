const Book = require('../models/book');
const Course = require('../models/course');
const NodeCache = require('node-cache');

// Initialize cache with 10 minutes TTL
const bookCache = new NodeCache({ stdTTL: 600 });

// Utility function for error handling
const handleError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message,
    });
};

// Utility function for success response
const handleSuccess = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

// GET /books - Get all books
exports.getAllBooks = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } },
            ];
        }

        const books = await Book.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await Book.countDocuments(query);

        return handleSuccess(res, 200, 'Books retrieved successfully', {
            books,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalBooks: total,
        });
    } catch (error) {
        console.error('Error retrieving books:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// GET /books/:id - Get single book
exports.getBookById = async (req, res) => {
    try {
        const { id } = req.params;
        const book = await Book.findById(id);

        if (!book) {
            return handleError(res, 404, 'Book not found');
        }

        return handleSuccess(res, 200, 'Book retrieved successfully', book);
    } catch (error) {
        console.error('Error retrieving book:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// POST /books - Create new book
exports.createBook = async (req, res) => {
    try {
        const { title, author, description, coverImage, link, isbn } = req.body;

        if (!title || !author) {
            return handleError(res, 400, 'Title and author are required');
        }

        const book = await Book.create({
            title,
            author,
            description,
            coverImage,
            link,
            isbn,
        });

        return handleSuccess(res, 201, 'Book created successfully', book);
    } catch (error) {
        console.error('Error creating book:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// PUT /books/:id - Update book
exports.updateBook = async (req, res) => {
    try {
        const { id } = req.params;
        const book = await Book.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!book) {
            return handleError(res, 404, 'Book not found');
        }

        return handleSuccess(res, 200, 'Book updated successfully', book);
    } catch (error) {
        console.error('Error updating book:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// DELETE /books/:id - Delete book
exports.deleteBook = async (req, res) => {
    try {
        const { id } = req.params;
        const book = await Book.findByIdAndDelete(id);

        if (!book) {
            return handleError(res, 404, 'Book not found');
        }

        return handleSuccess(res, 200, 'Book deleted successfully');
    } catch (error) {
        console.error('Error deleting book:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// GET /courses/:id/books - Get books for a course (Cached)
exports.getCourseBooks = async (req, res) => {
    try {
        const { id } = req.params; // Course ID
        const cacheKey = `course_books_${id}`;

        // Check cache
        const cachedData = bookCache.get(cacheKey);
        if (cachedData) {
            return handleSuccess(res, 200, 'Course books retrieved from cache', cachedData);
        }

        const course = await Course.findById(id)
            .populate('recommendedBooks.book')
            .populate('videos.recommendedBooks.book')
            .lean();

        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        // Process Books
        // Extract course-level books
        const courseBooks = course.recommendedBooks ? course.recommendedBooks.map(item => ({
            ...item.book,
            required: item.required,
            priority: item.priority,
            type: 'course'
        })) : [];

        // Extract module-level books
        const moduleBooks = [];
        if (course.videos) {
            course.videos.forEach(video => {
                if (video.recommendedBooks) {
                    video.recommendedBooks.forEach(item => {
                        moduleBooks.push({
                            ...item.book,
                            required: item.required,
                            priority: item.priority,
                            type: 'module',
                            moduleTitle: video.title,
                            moduleId: video._id
                        });
                    });
                }
            });
        }

        const result = {
            courseBooks: courseBooks.sort((a, b) => (a.priority || 0) - (b.priority || 0)),
            moduleBooks: moduleBooks
        };

        // Set cache
        bookCache.set(cacheKey, result);

        return handleSuccess(res, 200, 'Course books retrieved successfully', result);
    } catch (error) {
        console.error('Error retrieving course books:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// POST /courses/:id/books - Assign book to course
exports.assignBookToCourse = async (req, res) => {
    try {
        const { id } = req.params; // Course ID
        const { bookId, required, priority, videoId } = req.body;

        if (!bookId) {
            return handleError(res, 400, 'Book ID is required');
        }

        const course = await Course.findById(id);
        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        const newAssignment = {
            book: bookId,
            required: required || false,
            priority: priority || 0
        };

        if (videoId) {
            // Add to specific video/module
            const video = course.videos.id(videoId);
            if (!video) {
                return handleError(res, 404, 'Video module not found');
            }
            video.recommendedBooks = video.recommendedBooks || [];
            video.recommendedBooks.push(newAssignment);
        } else {
            // Add to course root
            course.recommendedBooks = course.recommendedBooks || [];
            course.recommendedBooks.push(newAssignment);
        }

        await course.save();

        // Invalidate cache
        bookCache.del(`course_books_${id}`);

        return handleSuccess(res, 200, 'Book assigned successfully', course);
    } catch (error) {
        console.error('Error assigning book:', error);
        return handleError(res, 500, 'Internal server error');
    }
};
