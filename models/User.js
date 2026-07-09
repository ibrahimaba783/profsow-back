const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Veuillez ajouter un nom'],
    },
    email: {
      type: String,
      required: [true, 'Veuillez ajouter un email'],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Veuillez ajouter un email valide',
      ],
    },
    password: {
      type: String,
      required: [true, 'Veuillez ajouter un mot de passe'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'teacher'],
      default: 'student',
    },
    avatar: {
      type: String,
      default: 'https://res.cloudinary.com/dzegaldyo/image/upload/v1672531193/cld-sample.jpg',
    },
    bio: {
      type: String,
      default: '',
    },
    // Informations optionnelles pour le professeur Aliou Sow ou autres
    subjects: {
      type: [String],
      default: ['Mathématiques', 'Physique-Chimie'],
    },
    levels: {
      type: [String],
      default: ['4ème', '3ème', '2nde S', '1ère S', 'TS'],
    },
    // Réinitialisation de mot de passe : on stocke un HASH du jeton (jamais
    // le jeton en clair) avec une date d'expiration courte.
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Crypter le mot de passe avant de sauvegarder
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Comparer les mots de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Générer un jeton de réinitialisation de mot de passe (valable 30 minutes).
// Retourne le jeton EN CLAIR (à envoyer par e-mail) tout en ne stockant en
// base que son empreinte SHA-256, pour qu'un accès à la base de données
// seule ne suffise pas à usurper un compte.
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);