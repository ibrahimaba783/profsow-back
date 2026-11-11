const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  let transporter;

  // Si l'utilisateur a configuré ses identifiants SMTP réels dans le fichier .env
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true pour le port 465, false pour les autres
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 5000, // 5s max pour établir la connexion SMTP
      greetingTimeout: 5000,
      socketTimeout: 7000,     // 7s max pour la communication
    });
  } else {
    // Sinon, fallback console pour ne jamais faire planter le serveur
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
        connectionTimeout: 4000,
      });
      console.log("Nodemailer : Utilisation du compte Ethereal temporaire :", testAccount.user);
    } catch (err) {
      console.warn("Nodemailer : Fallback sans SMTP, simulation console.");
      return {
        messageId: 'console-log-fallback-' + Date.now(),
        previewUrl: null
      };
    }
  }

  const message = {
    from: process.env.EMAIL_FROM || '"Aliou Sow - Plateforme de cours" <noreply@elearning-sow.com>',
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(message);
    console.log('E-mail envoyé avec succès ! ID du message : %s', info.messageId);

    // Si on utilise Ethereal, on extrait l'URL de prévisualisation
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      info.previewUrl = previewUrl;
    }
    return info;
  } catch (error) {
    console.error("Erreur d'envoi SMTP :", error.message);
    return {
      messageId: 'failed-smtp',
      error: error.message
    };
  }
};

module.exports = sendEmail;
