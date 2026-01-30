const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Book = require('../models/book');
const Course = require('../models/course');
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const bcrypt = require('bcrypt');

dotenv.config({ path: './config.env' });

const seedLibraryBooks = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    await Book.deleteMany({});
    await Borrow.deleteMany({});
    console.log('Cleared existing books and borrows');

    // Create a test tutor user if doesn't exist
    let tutor = await User.findOne({ email: 'tutor@chainverse.test' });
    if (!tutor) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      tutor = await User.create({
        email: 'tutor@chainverse.test',
        password: hashedPassword,
        fullName: 'Test Tutor',
        role: 'tutor',
        isEmailVerified: true,
      });
      console.log('Created test tutor user');
    }

    // Create test students for borrows
    const students = [];
    for (let i = 1; i <= 5; i++) {
      let student = await User.findOne({ email: `student${i}@chainverse.test` });
      if (!student) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        student = await User.create({
          email: `student${i}@chainverse.test`,
          password: hashedPassword,
          fullName: `Student ${i}`,
          role: 'student',
          isEmailVerified: true,
        });
      }
      students.push(student);
    }
    console.log('Created test students');

    // Create books with varied data
    const books = await Book.insertMany([
      {
        title: 'Mastering Stellar Blockchain Development',
        author: 'Alice Johnson',
        description: 'Comprehensive guide to building applications on the Stellar network, covering smart contracts, asset issuance, and DeFi protocols.',
        category: 'blockchain',
        tags: ['stellar', 'defi', 'smart-contracts'],
        coverImage: 'https://example.com/covers/stellar-mastery.jpg',
        link: 'https://example.com/books/stellar-mastery',
        isbn: '978-1234567890',
        createdAt: new Date('2024-01-10'),
      },
      {
        title: 'DeFi Fundamentals: A Complete Guide',
        author: 'Bob Smith',
        description: 'Learn decentralized finance from the ground up. Covers lending, borrowing, liquidity pools, and yield farming on Stellar and other networks.',
        category: 'defi',
        tags: ['defi', 'stellar', 'yield-farming'],
        coverImage: 'https://example.com/covers/defi-fundamentals.jpg',
        link: 'https://example.com/books/defi-fundamentals',
        isbn: '978-1234567891',
        createdAt: new Date('2024-01-15'),
      },
      {
        title: 'NFTs and Digital Ownership on Stellar',
        author: 'Carol Williams',
        description: 'Explore how NFTs work on Stellar, including creation, trading, and marketplace integration.',
        category: 'web3',
        tags: ['nft', 'stellar', 'web3'],
        coverImage: 'https://example.com/covers/nft-stellar.jpg',
        link: 'https://example.com/books/nft-stellar',
        isbn: '978-1234567892',
        createdAt: new Date('2024-01-20'),
      },
      {
        title: 'Smart Contracts on Stellar: Soroban Deep Dive',
        author: 'David Brown',
        description: 'Advanced techniques for writing, testing, and deploying Soroban smart contracts on Stellar.',
        category: 'blockchain',
        tags: ['smart-contracts', 'soroban', 'stellar'],
        coverImage: 'https://example.com/covers/soroban-deepdive.jpg',
        link: 'https://example.com/books/soroban-deepdive',
        isbn: '978-1234567893',
        createdAt: new Date('2024-01-25'),
      },
      {
        title: 'Stellar Payment Channels Explained',
        author: 'Eva Martinez',
        description: 'Understanding payment channels, lightning networks, and off-chain scaling solutions on Stellar.',
        category: 'defi',
        tags: ['stellar', 'payment-channels', 'scaling'],
        coverImage: 'https://example.com/covers/payment-channels.jpg',
        link: 'https://example.com/books/payment-channels',
        isbn: '978-1234567894',
        createdAt: new Date('2024-02-01'),
      },
      {
        title: 'Web3 Security Best Practices',
        author: 'Frank Lee',
        description: 'Security patterns and best practices for building secure Web3 applications, with focus on Stellar ecosystem.',
        category: 'web3',
        tags: ['security', 'web3', 'best-practices'],
        coverImage: 'https://example.com/covers/web3-security.jpg',
        link: 'https://example.com/books/web3-security',
        isbn: '978-1234567895',
        createdAt: new Date('2024-02-05'),
      },
      {
        title: 'Introduction to Stellar Lumens (XLM)',
        author: 'Grace Kim',
        description: 'Beginner-friendly introduction to Stellar Lumens, wallets, and basic transactions.',
        category: 'blockchain',
        tags: ['stellar', 'xlm', 'beginner'],
        coverImage: 'https://example.com/covers/xlm-intro.jpg',
        link: 'https://example.com/books/xlm-intro',
        isbn: '978-1234567896',
        createdAt: new Date('2024-02-10'),
      },
      {
        title: 'Building DApps on Stellar',
        author: 'Henry Chen',
        description: 'Step-by-step guide to building decentralized applications on the Stellar network.',
        category: 'web3',
        tags: ['dapps', 'stellar', 'web3', 'development'],
        coverImage: 'https://example.com/covers/dapps-stellar.jpg',
        link: 'https://example.com/books/dapps-stellar',
        isbn: '978-1234567897',
        createdAt: new Date('2024-02-15'),
      },
      {
        title: 'Stellar Asset Issuance Guide',
        author: 'Iris Patel',
        description: 'Complete guide to issuing and managing custom assets on the Stellar network.',
        category: 'defi',
        tags: ['stellar', 'asset-issuance', 'defi'],
        coverImage: 'https://example.com/covers/asset-issuance.jpg',
        link: 'https://example.com/books/asset-issuance',
        isbn: '978-1234567898',
        createdAt: new Date('2024-02-20'),
      },
      {
        title: 'Advanced DeFi Strategies on Stellar',
        author: 'Jack Wilson',
        description: 'Advanced strategies for yield optimization, arbitrage, and complex DeFi interactions on Stellar.',
        category: 'defi',
        tags: ['defi', 'stellar', 'advanced', 'yield-optimization'],
        coverImage: 'https://example.com/covers/advanced-defi.jpg',
        link: 'https://example.com/books/advanced-defi',
        isbn: '978-1234567899',
        createdAt: new Date('2024-02-25'),
      },
    ]);

    console.log(`Created ${books.length} books`);

    // Create courses with recommended books
    const course1 = await Course.create({
      title: 'Stellar Blockchain Development',
      description: 'Learn to build on Stellar',
      tutor: tutor._id,
      tutorEmail: tutor.email,
      tutorName: tutor.fullName,
      category: 'blockchain',
      tags: ['stellar', 'development'],
      status: 'published',
      isPublished: true,
      recommendedBooks: [
        { book: books[0]._id, required: true, priority: 1 },
        { book: books[3]._id, required: false, priority: 2 },
      ],
      videos: [
        {
          title: 'Module 1: Stellar Basics',
          url: 'https://example.com/video1',
          order: 1,
          recommendedBooks: [{ book: books[6]._id, required: false, priority: 1 }],
        },
        {
          title: 'Module 2: Smart Contracts',
          url: 'https://example.com/video2',
          order: 2,
          recommendedBooks: [{ book: books[3]._id, required: true, priority: 1 }],
        },
      ],
    });

    const course2 = await Course.create({
      title: 'DeFi on Stellar',
      description: 'Master DeFi protocols on Stellar',
      tutor: tutor._id,
      tutorEmail: tutor.email,
      tutorName: tutor.fullName,
      category: 'defi',
      tags: ['defi', 'stellar'],
      status: 'published',
      isPublished: true,
      recommendedBooks: [
        { book: books[1]._id, required: true, priority: 1 },
        { book: books[4]._id, required: false, priority: 2 },
        { book: books[8]._id, required: false, priority: 3 },
      ],
      videos: [
        {
          title: 'Module 1: DeFi Fundamentals',
          url: 'https://example.com/video3',
          order: 1,
          recommendedBooks: [{ book: books[1]._id, required: true, priority: 1 }],
        },
      ],
    });

    const course3 = await Course.create({
      title: 'Web3 Development',
      description: 'Build Web3 applications',
      tutor: tutor._id,
      tutorEmail: tutor.email,
      tutorName: tutor.fullName,
      category: 'web3',
      tags: ['web3', 'dapps'],
      status: 'published',
      isPublished: true,
      recommendedBooks: [
        { book: books[2]._id, required: false, priority: 1 },
        { book: books[5]._id, required: true, priority: 2 },
        { book: books[7]._id, required: false, priority: 3 },
      ],
    });

    console.log(`Created 3 courses with recommended books`);

    // Create borrow records to test "popular" sort
    const now = new Date();
    const borrows = [];

    // Book 0 (Stellar Mastery): 8 borrows (most popular)
    for (let i = 0; i < 8; i++) {
      borrows.push({
        userId: students[i % students.length]._id,
        resourceId: books[0]._id,
        resourceType: 'book',
        resourceTitle: books[0].title,
        expiryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
      });
    }

    // Book 1 (DeFi Fundamentals): 5 borrows
    for (let i = 0; i < 5; i++) {
      borrows.push({
        userId: students[i % students.length]._id,
        resourceId: books[1]._id,
        resourceType: 'book',
        resourceTitle: books[1].title,
        expiryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
      });
    }

    // Book 2 (NFTs): 3 borrows
    for (let i = 0; i < 3; i++) {
      borrows.push({
        userId: students[i % students.length]._id,
        resourceId: books[2]._id,
        resourceType: 'book',
        resourceTitle: books[2].title,
        expiryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
      });
    }

    // Book 3 (Soroban): 1 borrow
    borrows.push({
      userId: students[0]._id,
      resourceId: books[3]._id,
      resourceType: 'book',
      resourceTitle: books[3].title,
      expiryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    // Book 4 (Payment Channels): 2 borrows
    for (let i = 0; i < 2; i++) {
      borrows.push({
        userId: students[i]._id,
        resourceId: books[4]._id,
        resourceType: 'book',
        resourceTitle: books[4].title,
        expiryDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        status: 'active',
      });
    }

    await Borrow.insertMany(borrows);
    console.log(`Created ${borrows.length} borrow records`);

    console.log('\n=== Seed Summary ===');
    console.log(`Books created: ${books.length}`);
    console.log(`Courses created: 3`);
    console.log(`Borrows created: ${borrows.length}`);
    console.log('\nCourse IDs for testing:');
    console.log(`  Course 1 (Stellar Development): ${course1._id}`);
    console.log(`  Course 2 (DeFi on Stellar): ${course2._id}`);
    console.log(`  Course 3 (Web3 Development): ${course3._id}`);
    console.log('\nSeed completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedLibraryBooks();
}

module.exports = seedLibraryBooks;
