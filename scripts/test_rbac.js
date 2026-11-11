const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');

async function testRBAC() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connecté à MongoDB avec succès.');

  const admin = await User.findOne({ email: 'aliou@gmail.com' });
  const teacher = await User.findOne({ email: 'moussa@gmail.com' });

  console.log('1. Compte Administrateur :', admin ? `${admin.name} <${admin.email}> -> Rôle: [${admin.role}]` : 'Introuvable');
  console.log('2. Compte Professeur     :', teacher ? `${teacher.name} <${teacher.email}> -> Rôle: [${teacher.role}]` : 'Introuvable');

  const allCourses = await Course.find().populate('teacher', 'name email role');
  console.log(`3. Total modules en base : ${allCourses.length}`);
  allCourses.forEach((c, idx) => {
    console.log(`   - [${idx + 1}] "${c.title}" | Matière: ${c.subject} | Prof assigné: ${c.teacher?.name} (${c.teacher?.email}) | Actif: ${c.isActive !== false}`);
  });

  process.exit(0);
}

testRBAC().catch(err => {
  console.error('Erreur test RBAC :', err.message);
  process.exit(1);
});
