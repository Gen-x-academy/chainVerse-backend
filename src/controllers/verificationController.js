const Certificate = require('../models/certificate');
const NftAchievement = require('../models/NftAchievement');

exports.verifyCertificate = async (req, res) => {
  try {
    const cert = await Certificate.findOne({ verificationId: req.params.id }).populate('studentId courseId');
    if (!cert) return res.status(404).json({ verified: false, message: 'Certificate not found' });

    res.status(200).json({
      verified: true,
      student: cert.studentId.name,
      course: cert.courseId.title,
      completionDate: cert.completionDate
    });
  } catch (err) {
    res.status(500).json({ verified: false, message: 'Error verifying certificate' });
  }
};

exports.verifyNft = async (req, res) => {
  try {
    const nft = await NftAchievement.findOne({ tokenId: req.params.tokenId }).populate('studentId courseId');
    if (!nft) return res.status(404).json({ verified: false, message: 'NFT not found' });

    res.status(200).json({
      verified: true,
      student: nft.studentId.name,
      course: nft.courseId.title,
      mintedAt: nft.mintedAt
    });
  } catch (err) {
    res.status(500).json({ verified: false, message: 'Error verifying NFT' });
  }
};
