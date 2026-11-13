const Notification = require('../models/Notification');

// @desc    Obtenir les notifications de l'utilisateur connecté
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;

    const query = {
      $or: [
        { recipient: userId },
        { recipient: null, roleTarget: { $in: ['all', userRole] } },
      ],
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Marquer une notification comme lue
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification non trouvée' });
    }

    notification.isRead = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Marquer toutes les notifications comme lues
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;

    await Notification.updateMany(
      {
        $or: [
          { recipient: userId },
          { recipient: null, roleTarget: { $in: ['all', userRole] } },
        ],
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    res.json({ message: 'Toutes les notifications ont été marquées comme lues' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Diffuser une notification / annonce (Admin)
// @route   POST /api/notifications/broadcast
// @access  Private/Admin
const sendBroadcast = async (req, res) => {
  try {
    const { roleTarget, title, message, link, recipientId } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Le titre et le message sont requis.' });
    }

    const notif = await Notification.create({
      recipient: recipientId || null,
      roleTarget: roleTarget || 'all',
      type: 'broadcast_announcement',
      title,
      message,
      link: link || '',
      createdByUser: req.user._id,
    });

    res.status(201).json(notif);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  sendBroadcast,
};
