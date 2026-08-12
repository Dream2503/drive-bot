package me.dream.drivebot;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jspecify.annotations.NonNull;

import java.io.File;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public final class UploadCommand implements CommandExecutor {

    private final DriveBot plugin;

    public UploadCommand(DriveBot plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NonNull CommandSender sender, @NonNull Command command, @NonNull String label, String[] args) {

        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command.");
            return true;
        }

        File[] files = plugin.getUploadFolder().listFiles(File::isFile);

        if (files == null || files.length == 0) {
            player.sendMessage("§cNo files found.");
            return true;
        }

        Arrays.sort(files, Comparator.comparing(File::getName));

        File file = files[0];

        try {

            // Don't overwrite existing files
            if (plugin.getDatabase().exists(file.getName())) {
                player.sendMessage("§cA file named '" + file.getName() + "' already exists.");
                return true;
            }

            List<Integer> data = FileEncoder.encode(file.toPath());

            Cursor start = plugin.getDatabase().getCursor();

            if (start == null) {
                player.sendMessage("§cDatabase cursor not initialized.");
                return true;
            }

            Cursor end = ChunkWriter.write(start, data);

            plugin.getDatabase().insert(file.getName(), start);
            plugin.getDatabase().setCursor(end);

            player.sendMessage("§aUpload complete!");
            player.sendMessage("§7File   : " + file.getName());
            player.sendMessage("§7Bytes  : " + file.length());
            player.sendMessage("§7Blocks : " + data.size());

        } catch (IOException e) {

            player.sendMessage("§cFailed to read file.");
            e.printStackTrace();

        } catch (SQLException e) {

            player.sendMessage("§cDatabase error.");
            e.printStackTrace();

        } catch (RuntimeException e) {

            player.sendMessage("§cNot enough storage space.");
            e.printStackTrace();
        }

        return true;
    }
}