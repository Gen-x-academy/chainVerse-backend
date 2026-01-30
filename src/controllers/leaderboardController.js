const ChallengeResult = require('../models/ChallengeResult');
const User = require('../models/User');
const Student = require('../models/student');
const mongoose = require('mongoose');

const getLeaderboard = async (req, res, type) => {
    try {
        const { id } = req.params;
        const { timeFrame = 'all-time', sortBy = 'winRate', limit = 10, page = 1 } = req.query;

        // Filter by Timeframe
        let dateFilter = {};
        const now = new Date();
        if (timeFrame === 'weekly') {
            const lastWeek = new Date(now.setDate(now.getDate() - 7));
            dateFilter = { completedAt: { $gte: lastWeek } };
        } else if (timeFrame === 'monthly') {
            const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
            dateFilter = { completedAt: { $gte: lastMonth } };
        }

        // Determine Match Filter (Course or Topic)
        const matchStage = {
            $match: {
                ...dateFilter
            }
        };

        const lookupChallengeStage = {
            $lookup: {
                from: 'challenges',
                localField: 'challengeId',
                foreignField: '_id',
                as: 'challenge'
            }
        };

        const unwindChallengeStage = { $unwind: '$challenge' };

        const filterByScopeStage = {
            $match: {
                'challenge.status': 'completed'
            }
        };

        if (type === 'course') {
            filterByScopeStage.$match['challenge.courseId'] = id;
        } else if (type === 'topic') {
            filterByScopeStage.$match['challenge.moduleId'] = id;
        }

        // Reshape Data for Player Aggregation
        const projectPlayersStage = {
            $project: {
                players: [
                    {
                        playerId: '$playerOneId',
                        score: '$playerOneScore',
                        isWinner: { $eq: ['$winnerId', '$playerOneId'] }
                    },
                    {
                        playerId: '$playerTwoId',
                        score: '$playerTwoScore',
                        isWinner: { $eq: ['$winnerId', '$playerTwoId'] }
                    }
                ]
            }
        };

        const unwindPlayersStage = { $unwind: '$players' };

        // Group by Player
        const groupStage = {
            $group: {
                _id: '$players.playerId',
                totalGames: { $sum: 1 },
                wins: { $sum: { $cond: ['$players.isWinner', 1, 0] } },
                totalPoints: { $sum: '$players.score' }
            }
        };

        // Calculate Metrics
        const calculateMetricsStage = {
            $project: {
                _id: 1,
                totalGames: 1,
                wins: 1,
                totalPoints: 1,
                winRate: {
                    $multiply: [
                        { $divide: ['$wins', '$totalGames'] },
                        100
                    ]
                },
                averagePoints: { $divide: ['$totalPoints', '$totalGames'] }
            }
        };

        // Lookup User Details
        const lookupStudentStage = {
            $lookup: {
                from: 'students',
                localField: '_id',
                foreignField: '_id',
                as: 'studentInfo'
            }
        };

        const unwindStudentStage = {
            $unwind: { path: '$studentInfo', preserveNullAndEmptyArrays: true }
        };

        let sortStage = {};
        if (sortBy === 'winRate') {
            sortStage = { $sort: { winRate: -1, totalPoints: -1 } };
        } else if (sortBy === 'points') {
            sortStage = { $sort: { totalPoints: -1, winRate: -1 } };
        } else if (sortBy === 'participation') {
            sortStage = { $sort: { totalGames: -1, winRate: -1 } };
        } else {
            sortStage = { $sort: { winRate: -1 } };
        }

        // 8. Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitStage = { $limit: parseInt(limit) };
        const skipStage = { $skip: skip };

        const pipeline = [
            matchStage,
            lookupChallengeStage,
            unwindChallengeStage,
            filterByScopeStage,
            projectPlayersStage,
            unwindPlayersStage,
            groupStage,
            calculateMetricsStage,
            lookupStudentStage,
            unwindStudentStage,
            {
                $project: {
                    _id: 1,
                    rank: { $literal: 0 },
                    fullName: '$studentInfo.name',
                    avatar: '$studentInfo.profileImage',
                    winRate: { $round: ['$winRate', 1] },
                    averagePoints: { $round: ['$averagePoints', 1] },
                    totalPoints: 1,
                    totalGames: 1,
                    wins: 1,
                    badges: []
                }
            },
            sortStage,
            skipStage,
            limitStage
        ];

        const leaderboard = await ChallengeResult.aggregate(pipeline);

        // Assign ranks
        const rankedLeaderboard = leaderboard.map((entry, index) => ({
            ...entry,
            rank: skip + index + 1
        }));

        res.status(200).json({
            success: true,
            count: rankedLeaderboard.length,
            data: rankedLeaderboard
        });

    } catch (error) {
        console.error('Leaderboard Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getCourseLeaderboard = (req, res) => getLeaderboard(req, res, 'course');
exports.getTopicLeaderboard = (req, res) => getLeaderboard(req, res, 'topic');
