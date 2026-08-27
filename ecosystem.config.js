// pm2 config so the Pi can start the dashboard with a short, paste-safe command:
//   sudo env PATH=$PATH pm2 start ecosystem.config.js
//   sudo env PATH=$PATH pm2 save
module.exports = {
  apps: [
    {
      name: 'smart-garden',
      script: 'server.js',
      cwd: '/home/agent/smart-garden-pi',
      env: {
        PORT: 3010,
      },
    },
  ],
};
