/**
 * Sample course records for local development seeding.
 * `tutorId` and `tutorEmail` should correspond to a tutor in your local DB.
 * These records use the placeholder tutor produced by the seed runner.
 */

export const courseSeeds = [
  {
    title: 'Introduction to Blockchain',
    description: 'A beginner-friendly introduction to blockchain technology, cryptocurrencies, and decentralised applications.',
    category: 'Technology',
    tags: ['blockchain', 'crypto', 'web3'],
    price: 0,
    thumbnailUrl: 'https://placehold.co/600x400?text=Intro+to+Blockchain',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    status: 'published',
    enrolledStudents: [],
  },
  {
    title: 'Smart Contract Development with Solidity',
    description: 'Learn to write, test, and deploy smart contracts on Ethereum using Solidity.',
    category: 'Technology',
    tags: ['solidity', 'ethereum', 'smart-contracts'],
    price: 49.99,
    thumbnailUrl: 'https://placehold.co/600x400?text=Solidity+Dev',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    status: 'published',
    enrolledStudents: [],
  },
  {
    title: 'DeFi Fundamentals',
    description: 'Understand decentralised finance protocols, yield farming, liquidity pools, and governance tokens.',
    category: 'Finance',
    tags: ['defi', 'yield-farming', 'liquidity'],
    price: 29.99,
    thumbnailUrl: 'https://placehold.co/600x400?text=DeFi+Fundamentals',
    tutorId: 'seed-tutor-id',
    tutorEmail: 'tutor@chainverse.dev',
    status: 'draft',
    enrolledStudents: [],
  },
];
