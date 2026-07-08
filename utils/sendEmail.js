const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  let transporter;

  // Si l'utilisateur a configuré ses identifiants SMTP réels dans le fichier .env
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true pour le port 465, false pour les autres
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Sinon, on crée un compte Ethereal de test automatique pour simuler un envoi réel et générer un lien de visualisation
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log("Nodemailer : Utilisation du compte Ethereal temporaire pour simuler un envoi réel :", testAccount.user);
    } catch (err) {
      console.error("Erreur lors de la création du compte Ethereal. Utilisation d'un transport console.", err);
      // Fallback ultime : loguer dans la console
      return {
        messageId: 'console-log-fallback',
        previewUrl: 'N/A'
      };
    }
  }

  const message = {
    from: process.env.EMAIL_FROM || '"Aliou Sow - Plateforme de cours" <noreply@elearning-sow.com>',
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  const info = await transporter.sendMail(message);

  console.log('E-mail envoyé avec succès ! ID du message : %s', info.messageId);
  
  // Si on utilise Ethereal, on affiche l'URL de prévisualisation
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log("Prévisualisez l'e-mail réel envoyé ici : %s", previewUrl);
    info.previewUrl = previewUrl;
  }

  return info;
};

module.exports = sendEmail;
