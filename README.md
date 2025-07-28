# 📁 Drive Bot

A powerful Discord bot that lets users upload Google Drive files, splits large files into parts, stores them via Discord messages, and tracks everything using a personal flat "drive" system.

---

## 🚀 Features

- 🔗 Upload files via Google Drive links  
- 📦 Automatically split files larger than 10MB  
- 🔐 User data is isolated using Discord IDs  
- 🔄 Avoids duplicate uploads by hashing chunks (SHA-256)  
- 💬 Interact using easy-to-use `!commands`  
- 🗂️ Flat file system view of your uploaded files  

---

## 🛠️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/Dream2503/drive-bot.git
cd drive-bot
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Add your Discord bot token

Create a file at `database/bot_creds.txt` and paste your token in it:

```txt
YOUR_DISCORD_BOT_TOKEN
```

Make sure this token file is **excluded** from Git!

### 4. Run the bot

```bash
python app.py
```

---

## 📜 Available Commands

| Command               | Description                              |
|-----------------------|------------------------------------------|
| `!upload <link>`      | Upload a Google Drive file               |
| `!ls`                 | List all uploaded files                  |
| `!clear`              | Clear bot/user messages (100 max)       |
| `!ping`               | Check if the bot is alive                |
| `!help`               | View all available commands              |
| `!shell <code>`       | (DEV) Execute Python shell code          |

---

## 🗃️ Project Structure

```
drive_bot/
│
├── app.py              # Main bot setup & entry point
├── commands.py         # All bot commands (!ls, !clear, etc.)
├── upload.py           # Google Drive handling, hashing, Discord upload
├── utils.py            # Utility functions (JSON, formatting)
├── database/
│   ├── bot_creds.txt   # Your bot token (DO NOT COMMIT)
│   ├── drive.json      # Tracks file metadata per user
│   └── commands.json   # Help descriptions
├── upload/             # Temporarily stores files before uploading
└── requirements.txt    # Python dependencies
```

---

## ✅ To-Do / Ideas

- [ ] Add file deletion support  
- [ ] Add file download support  
- [ ] Support subfolders or tagging  
- [ ] Web dashboard (maybe 👀)

---

## 📄 License

This project is open source under the [MIT License](LICENSE).

---

> Made with ❤️ by [@Dream2503](https://github.com/Dream2503)
