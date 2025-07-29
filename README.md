# 📁 Drive Bot

A powerful Discord bot that lets users **upload Google Drive files**, splits large files into manageable chunks, stores
them in Discord itself, and tracks everything using a private, per-user "drive" system. Seamlessly integrates with your
community, giving each user their own cloud-like file space right in Discord.

---

## 🚀 Features

* 🔗 **Upload files via Google Drive links or local files**
* 📦 **Auto-split files larger than 10MB** (Discord attachment-friendly)
* 🔐 **User data is isolated** — each user's files are kept separate (by Discord ID)
* 🔄 **No duplicate uploads** — hash-checked chunking with SHA-256
* 💬 **Easy-to-use `!commands`** for upload, download, delete, and list
* 🗂️ **Flat file system** per user
* 🧹 **Clean up bot/user messages** for less clutter
* ⚠️ **Admin-only shell command** (for trusted debugging)
* ✅ **Delete and download files anytime**

---

## 🤖 Invite the Bot

Want to test it on your own server?
[Click here to invite](https://discord.com/oauth2/authorize?client_id=1399287140885725245&scope=bot&permissions=274878254080)

---

## 🛠️ Setup

1. **Create a Discord Bot**

* Go to the [Discord Developer Portal](https://discord.com/developers/applications)
* Click **"New Application"**, give it a name (e.g., Drive Bot), and click Create
* Under "Bot" tab, click "Add Bot" and confirm
* Enable **MESSAGE CONTENT INTENT** under Privileged Gateway Intents
* Under "OAuth2" > "URL Generator":
    * **Scopes:** `bot`
    * **Bot Permissions:** Send Messages, Read Message History, Manage Messages, Attach Files
* Copy the generated OAuth2 URL and use it to invite the bot

2. **Clone the repository**

```bash
git clone https://github.com/Dream2503/drive-bot.git
cd drive-bot
```

3. **Install dependencies**

```bash
pip install -r requirements.txt
```

4. **Add your Discord bot token**
   Create a file at `database/bot_creds.txt`:

```txt
YOUR_DISCORD_BOT_TOKEN
```

> ❗ **Never commit this token!** The file is gitignored.

5. **Set the file upload channel**
   Edit `FILE_DUMP_ID` in `settings.py` to the Discord channel ID where chunks should be uploaded/downloaded.

6. **Run the bot**

```bash
python app.py
```

---

## 📜 Commands Overview

| Command                                                | Description                                                                                        |
|--------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `!ls`                                                  | 📁 View your uploaded file on the server.                                                          |
| `!upload <google_drive_link\filename> [filename2 ...]` | 📄 Upload one or more files: specify multiple local filenames or Google Drive links, or use `all`. |
| `!upload all`                                          | 📄 Upload all files from your upload directory to your drive at once.                              |
| `!download <filename> [filename2 ...]`                 | 📅 Download one or more files by name, or use `all` to download everything from your drive.        |
| `!download all`                                        | 📅 Download all files from your drive at once.                                                     |
| `!clear`                                               | 🧹 Clears bot-sent messages in your DM for a cleaner interface.                                    |
| `!ping`                                                | 🏓 Check if the bot is online and responding.                                                      |
| `!help`                                                | 🆘 View all available commands and their usage.                                                    |
| `!shell <command>`                                     | ⚠️ Execute raw Python code (admin/debug only; unsafe).                                             |
| `!remove <filename> [filename2 ...]`                   | 🗑️ Remove one or multiple files and all their parts by specifying filenames.                      |
| `!remove all`                                          | 🗑️ Remove all files from your drive at once.                                                      |

---

## 🗃️ Project Structure

```
drive_bot/
├── app.py              # Main bot startup and event logic
├── commands.py         # All user/bot commands (!ls, !remove, etc.)
├── transfer.py         # Upload/chunking and Download/reconstruction logic
├── utils.py            # Helper functions (JSON, GDrive parsing, hashing)
├── settings.py         # Config, bot token, channel IDs
├── database/
│   ├── bot_creds.txt   # Discord bot token (NEVER COMMIT)
│   ├── drive.json      # Tracks uploaded files per user
│   └── commands.json   # Command help/usage descriptions
├── upload/             # Temporary holding folder for uploads
├── download/           # Output directory for downloads
└── requirements.txt    # Python dependencies (discord.py, gdown etc.)
```

---

## 🔑 Security Notes

* **Admins:** Add your Discord ID(s) to `BOT_ADMINS` in `settings.py` to control access to `!shell`
* **Privacy:** Files are private per user (based on Discord ID)
* **No file type restriction:** Bot stores any file type; you can add filters
* **Storage is local only** — not cloud-based. Discord and your server must be secure.

---

## ✅ To-Do / Ideas

* [x] Add file deletion support (`!remove`)
* [x] Add file download support (`!download`)
* [ ] Support subfolders or tagging
* [ ] User quotas or per-file size limits
* [ ] Per-channel, per-guild configuration

---

## 📄 License

Open source under the [MIT License](LICENSE).

---

> Made with ❤️ by [@Dream2503](https://github.com/Dream2503)