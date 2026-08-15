module.exports = {
    apps: [
        {
            name: "vaded-gaming-bot",
            script: "./packages/bot/dist/index.js",
            cwd: __dirname,
            instances: 1,
            autorestart: true,
            watch: false,
            // Discord.js + voice/audio deps (opus, ffmpeg, yt-dlp piping) sit
            // around 500MB+ at cold boot before any guilds/voice connections
            // are active — 300M restart-looped the bot before it could finish
            // connecting (#observed on the panel host, 2026-08-15).
            max_memory_restart: "768M",
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
