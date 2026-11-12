const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connecté à MongoDB.');

    const targetEmail = 'ibah2536@gmail.com';
    let admin = await User.findOne({ email: targetEmail }).select('+password');

    if (!admin) {
      admin = new User({
        name: 'Ibrahima Ba',
        email: targetEmail,
        role: 'admin',
        title: 'Administrateur Plateforme',
        isActive: true,
      });
    } else {
      admin.role = 'admin';
      admin.isActive = true;
      if (!admin.title) admin.title = 'Administrateur Plateforme';
    }

    admin.password = '123456';
    await admin.save();

    const verified = await admin.matchPassword('123456');
    if (!verified) {
      throw new Error('Échec de vérification du mot de passe hashé');
    }

    console.log('✓ Compte Administrateur prêt :', {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      passwordVerified: verified,
    });
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Erreur setupAdmin :', err);
    process.exit(1);
  }
}

run();
