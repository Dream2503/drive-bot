from storelimtless import User, Directory, StoreLimitless

client: User = StoreLimitless.login("iamloki", "whoami")
directory: Directory = client.directory
# print(directory.upload("/home/dream/Downloads/video.mp4", "Telegram"))
# print(directory.upload("https://drive.google.com/file/d/1OP5AkfKzvugzV-dCb-HSN9o--FeloyaC/view?usp=drive_link", "Discord"))
# print(directory.upload("https://youtu.be/Ig5D3XPK4Xo?si=B__yAWdUVV8skSGE", "Telegram"))
print(*directory.ls()[1], sep='\n')
directory.find("video")[1][0].download()
