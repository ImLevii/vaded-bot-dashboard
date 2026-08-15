module.exports = {
    apps: [
        {
            name: "vaded-gaming-bot",
            script: "./packages/bot/dist/index.js",
            cwd: __dirname,
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "300M",
            kill_timeout: 5000,
            env: { NODE_ENV: "production" },
            env_production: { NODE_ENV: "production" },
        },
        {
            name: "vaded-gaming-backend",
            script: "./packages/backend/dist/index.js",
            cwd: __dirname,
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "300M",
            kill_timeout: 5000,
            env: { NODE_ENV: "production" },
            env_production: { NODE_ENV: "production" },
        },
    ],
}
