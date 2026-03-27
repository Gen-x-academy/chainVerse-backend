/**
 * Sample course records for local development seeding.
 * `tutorId` and `tutorEmail` should correspond to a tutor in your local DB.
 * These records use the placeholder tutor produced by the seed runner.
 */

export const courseSeeds = [
  {
    title: 'Introduction to Blockchain',
    description:
      'A beginner-friendly introduction to blockchain technology, cryptocurrencies, and decentralised applications.',
    category: 'Technology',
    tags: ['blockchain', 'crypto', 'web3'],
    price: 0,
    thumbnailUrl: 'https://placehold.co/600x400?text=Intro+to+Blockchain',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    tutorName: 'Seed Tutor',
    status: 'published',
    level: 'beginner',
    duration: '4 hours',
    durationHours: 4,
    language: 'English',
    hasCertificate: true,
    enrolledStudents: [],
    totalEnrollments: 0,
    curriculum: [
      {
        title: 'What is Blockchain?',
        description: 'Introduction to blockchain concepts',
        duration: '30 mins',
        order: 1,
        resources: [],
      },
      {
        title: 'How Cryptocurrencies Work',
        description: 'Understanding Bitcoin and altcoins',
        duration: '45 mins',
        order: 2,
        resources: [],
      },
    ],
  },
  {
    title: 'Smart Contract Development with Solidity',
    description:
      'Learn to write, test, and deploy smart contracts on Ethereum using Solidity.',
    category: 'Technology',
    tags: ['solidity', 'ethereum', 'smart-contracts'],
    price: 49.99,
    thumbnailUrl: 'https://placehold.co/600x400?text=Solidity+Dev',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    tutorName: 'Seed Tutor',
    status: 'published',
    level: 'intermediate',
    duration: '12 hours',
    durationHours: 12,
    language: 'English',
    hasCertificate: true,
    enrolledStudents: [],
    totalEnrollments: 0,
    curriculum: [
      {
        title: 'Solidity Basics',
        description: 'Learn the Solidity syntax',
        duration: '1 hour',
        order: 1,
        resources: [],
      },
      {
        title: 'Writing Your First Smart Contract',
        description: 'Hands-on smart contract development',
        duration: '2 hours',
        order: 2,
        resources: [],
      },
    ],
  },
  {
    title: 'DeFi Fundamentals',
    description:
      'Understand decentralised finance protocols, yield farming, liquidity pools, and governance tokens.',
    category: 'Finance',
    tags: ['defi', 'yield-farming', 'liquidity'],
    price: 29.99,
    thumbnailUrl: 'https://placehold.co/600x400?text=DeFi+Fundamentals',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    tutorName: 'Seed Tutor',
    status: 'draft',
    level: 'intermediate',
    duration: '8 hours',
    durationHours: 8,
    language: 'English',
    hasCertificate: false,
    enrolledStudents: [],
    totalEnrollments: 0,
    curriculum: [
      {
        title: 'Introduction to DeFi',
        description: 'What is decentralized finance',
        duration: '45 mins',
        order: 1,
        resources: [],
      },
    ],
  },
];
