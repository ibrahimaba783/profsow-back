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
userSchema.pre('save', async function (next) {
  // BUGFIX : le "return" est indispensable ici. Sans lui, même quand le mot
  // de passe n'est pas modifié (ex: on sauvegarde juste après avoir changé
  // la bio ou les matières), l'exécution continuait quand même vers le
  // hashage plus bas et re-hashait un mot de passe déjà hashé (ou undefined
  // si le champ n'était pas chargé), rendant le compte impossible à
  // reconnecter sans que rien ne le signale.
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
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