const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connecté à MongoDB avec succès.');

    // 1. Mise à jour / Création du compte Administrateur ibah2536@gmail.com
    let adminUser = await User.findOne({ email: 'ibah2536@gmail.com' }).select('+password');
    if (!adminUser) {
      console.log("Création du compte administrateur ibah2536@gmail.com...");
      adminUser = new User({
        name: 'Ibrahima Ba',
        email: 'ibah2536@gmail.com',
        role: 'admin',
      });
    } else {
      console.log("Compte existant trouvé pour ibah2536@gmail.com. Mise à jour du rôle et du mot de passe...");
      adminUser.role = 'admin';
    }

    // Définition du mot de passe demandé : Poullo78
    // L'assignation à adminUser.password puis save() déclenche le hook bcrypt de User.js
    adminUser.password = 'Poullo78';
    await adminUser.save();
    console.log('✓ Compte Administrateur configuré :');
    console.log(`  Email : ${adminUser.email}`);
    console.log(`  Rôle  : ${adminUser.role}`);

    // Vérification de la validité du mot de passe avec matchPassword
    const testMatch = await adminUser.matchPassword('Poullo78');
    if (!testMatch) {
      throw new Error("Échec de vérification du mot de passe hashé pour ibah2536@gmail.com");
    }
    console.log('✓ Validation mot de passe "Poullo78" : SUCCÈS (matchPassword = true)');

    // 2. Confirmation stricte avant de modifier aliou@gmail.com
    const confirmAdmin = await User.findOne({ email: 'ibah2536@gmail.com' });
    if (!confirmAdmin || confirmAdmin.role !== 'admin') {
      throw new Error("L'administrateur ibah2536@gmail.com n'est pas confirmé en base. Annulation du changement pour aliou@gmail.com.");
    }

    // 3. Passer aliou@gmail.com au rôle 'teacher'
    const teacherUser = await User.findOne({ email: 'aliou@gmail.com' });
    if (!teacherUser) {
      console.warn("Compte aliou@gmail.com non trouvé.");
    } else {
      teacherUser.role = 'teacher';
      await teacherUser.save({ validateBeforeSave: false });
      console.log('✓ Compte Enseignant configuré :');
      console.log(`  Email : ${teacherUser.email}`);
      console.log(`  Rôle  : ${teacherUser.role}`);
    }

    console.log('\n--- BILAN FINAL DES COMPTES EN BASE ---');
    const allKeyUsers = await User.find({ email: { $in: ['ibah2536@gmail.com', 'aliou@gmail.com'] } }, 'name email role');
    console.log(JSON.stringify(allKeyUsers, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
