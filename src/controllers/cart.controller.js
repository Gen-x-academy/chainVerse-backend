const cartService = require('../services/cartService');

exports.mergeCart = async (req, res) => {
	try {
		const userId = req.user._id;
		const guestCart = req.body.guestCart;

		const merged = await cartService.mergeGuestCart(userId, guestCart);
		res.status(200).json({ message: 'Cart merged successfully', cart: merged });
	} catch (error) {
		console.error('Merge error:', error.message);
		res.status(400).json({ error: error.message });
	}
};
