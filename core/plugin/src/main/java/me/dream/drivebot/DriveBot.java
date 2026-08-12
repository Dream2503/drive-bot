package me.dream.drivebot;

import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.sql.SQLException;

public final class DriveBot extends JavaPlugin {
    private final int maxX = 3, maxZ = 3;
    private File uploadFolder;
    private Database database;

    @Override
    public void onEnable() {
        createFolders();

        try {
            BlockPalette.load(this);
            database = new Database(this);

            if (database.getCursor() == null) {
                database.setCursor(new Cursor(
                        getServer().getWorlds().getFirst(),
                        maxX,
                        maxZ
                ));
            }

        } catch (Exception e) {
            getLogger().severe("Failed to initialize UploadLabs.");
            e.printStackTrace();

            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        if (getCommand("upload") == null) {
            getLogger().severe("Command '/upload' missing from plugin.yml");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        getCommand("upload").setExecutor(new UploadCommand(this));

        getLogger().info("UploadLabs enabled.");
        getLogger().info("Upload folder : " + uploadFolder.getAbsolutePath());
        getLogger().info("Palette size  : " + BlockPalette.size());
        getLogger().info("Bits/block    : " + BlockPalette.bitsPerBlock());
    }

    @Override
    public void onDisable() {
        if (database != null) {
            try {
                database.close();
            } catch (SQLException e) {
                e.printStackTrace();
            }
        }
        getLogger().info("UploadLabs disabled.");
    }

    private void createFolders() {
        if (!getDataFolder().exists()) {
            getDataFolder().mkdirs();
        }
        uploadFolder = new File(getDataFolder(), "data");

        if (!uploadFolder.exists()) {
            uploadFolder.mkdirs();
        }
    }

    public File getUploadFolder() {
        return uploadFolder;
    }

    public Database getDatabase() {
        return database;
    }
}