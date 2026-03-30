module.exports = {
  apps: [
    {
      name: 'nexterm',
      script: 'dist/server/server.js',
      node_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_memory_restart: '500M',
      error_file: '~/.pm2/logs/nexterm/error.log',
      out_file: '~/.pm2/logs/nexterm/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
