const NftAchievement = require('../models/NftAchievement');
const Certificate = require('../models/certificate');
const { mintNFT, getMetadataUrl } = require('../utils/nftService');

exports.mintNft = async (req, res) => {
  try {
    const studentId = req.user._id;
    const courseId = req.params.id;
    const cert = await Certificate.findOne({ studentId, courseId });
    if (!cert) return res.status(403).json({ message: 'Certificate not found. Complete course first.' });

    const metadataUrl = await getMetadataUrl(cert);
    const tokenId = await mintNFT(req.user.walletAddress, metadataUrl);

    const nft = await NftAchievement.create({
      studentId,
      courseId,
      tokenId,
      metadataUrl
    });

    res.status(201).json({ message: 'NFT minted', nft });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error minting NFT' });
  }
};

exports.getStudentNfts = async (req, res) => {
  try {
    const studentId = req.params.id;
    const nfts = await NftAchievement.find({ studentId });
    res.status(200).json(nfts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch NFTs' });
  }
};
