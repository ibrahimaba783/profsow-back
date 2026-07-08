/**
 * Script à exécuter UNE SEULE FOIS pour créer le compte du professeur
 * (M. Aliou Sow) directement en base de données.
 *
 * Pourquoi un script à part et pas le formulaire d'inscription public ?
 * → La plateforme est mono-professeur : seul M. Aliou Sow doit avoir le
 *   rôle "teacher". Le formulaire /register public ne crée désormais que
 *   des comptes "student", donc ce script est le seul moyen de créer le
 *   compte enseignant.
 *
 * Utilisation :
 *   1. Modifie les valeurs TEACHER_NAME / TEACHER_EMAIL / TEACHER_PASSWORD
 *      ci-dessous avec les vraies informations de M. Aliou Sow.
 *   2. Depuis le dossier back/, lance :
 *        node scripts/createTeacher.js
 *   3. Une fois le compte créé, tu peux supprimer ce script ou le garder
 *      de côté (il ne recréera pas de doublon si le compte existe déjà).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

// --- À MODIFIER AVANT DE LANCER LE SCRIPT ---
const TEACHER_NAME = 'Aliou Sow';
const TEACHER_EMAIL = 'aliou@gmail.com';
const TEACHER_PASSWORD = 'ChangeMoiAvantDeLancer123'; // mot de passe temporaire, à changer ensuite dans le profil
// ---------------------------------------------

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connecté à MongoDB.');

    const existing = await User.findOne({ email: TEACHER_EMAIL }).select('+password');
    if (existing) {
      console.log(`Un compte existe déjà avec l'email ${TEACHER_EMAIL} (rôle actuel : ${existing.role}).`);
      existing.role = 'teacher';
      existing.name = TEACHER_NAME;
      existing.password = TEACHER_PASSWORD; // déclenche le hook de hashage du modèle
      await existing.save();
      console.log('Le rôle a été confirmé "teacher" et le mot de passe a été RÉINITIALISÉ');
      console.log(`avec la valeur définie dans TEACHER_PASSWORD ci-dessus : "${TEACHER_PASSWORD}"`);
      console.log('Connecte-toi avec ce mot de passe, puis change-le depuis ton profil.');
      process.exit(0);
    }

    // User.create() déclenche le même hook de hashage de mot de passe
    // que lors d'une inscription normale via le formulaire.
    const teacher = await User.create({
      name: TEACHER_NAME,
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
      role: 'teacher',
    });

    console.log('Compte professeur créé avec succès :');
    console.log(`  Nom   : ${teacher.name}`);
    console.log(`  Email : ${teacher.email}`);
    console.log(`  Rôle  : ${teacher.role}`);
    console.log('\nPense à te connecter et à changer le mot de passe temporaire depuis le profil.');

    process.exit(0);
  } catch (error) {
    console.error('Erreur lors de la création du compte professeur :', error);
    process.exit(1);
  }
};

run();