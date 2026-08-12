package me.dream.drivebot;

import org.bukkit.Bukkit;
import org.bukkit.World;

import java.io.File;
import java.sql.*;
import java.util.UUID;

public final class Database {
    private final Connection connection;

    public Database(DriveBot plugin) throws SQLException {
        connection = DriverManager.getConnection("jdbc:sqlite:" + new File(plugin.getDataFolder(), "database.db").getAbsolutePath());

        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                        CREATE TABLE IF NOT EXISTS cursor (
                            world TEXT NOT NULL,
                            maxX INTEGER NOT NULL,
                            maxZ INTEGER NOT NULL,
                            chunkX INTEGER NOT NULL,
                            chunkZ INTEGER NOT NULL,
                            x INTEGER NOT NULL,
                            y INTEGER NOT NULL,
                            z INTEGER NOT NULL
                        );
                    """);
            statement.execute("""
                        CREATE TABLE IF NOT EXISTS files (
                              filename TEXT PRIMARY KEY,
                              world TEXT NOT NULL,
                              chunkX INTEGER NOT NULL,
                              chunkZ INTEGER NOT NULL,
                              x INTEGER NOT NULL,
                              y INTEGER NOT NULL,
                              z INTEGER NOT NULL
                          );
                    """);
        }
    }

    public Cursor getCursor() throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery("SELECT * FROM cursor LIMIT 1")) {
            if (!result.next()) {
                return null;
            }
            UUID worldId = UUID.fromString(result.getString("world"));
            World world = Bukkit.getWorld(worldId);

            if (world == null) {
                throw new SQLException("World not found: " + worldId);
            }
            return new Cursor(world, result.getInt("maxX"), result.getInt("maxZ"), result.getInt("chunkX"), result.getInt("chunkZ"), result.getInt(
                    "x"), result.getInt("y"), result.getInt("z"));
        }
    }

    public void setCursor(Cursor cursor) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM cursor");
        }
        try (PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO cursor (world, maxX, maxZ, chunkX, chunkZ, x, y, z)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
            statement.setString(1, cursor.world().getUID().toString());
            statement.setInt(2, cursor.maxX());
            statement.setInt(3, cursor.maxZ());
            statement.setInt(4, cursor.chunkX());
            statement.setInt(5, cursor.chunkZ());
            statement.setInt(6, cursor.x());
            statement.setInt(7, cursor.y());
            statement.setInt(8, cursor.z());
            statement.executeUpdate();
        }
    }

    public boolean exists(String filename) throws SQLException {

        try (PreparedStatement stmt = connection.prepareStatement("""
                SELECT 1
                FROM files
                WHERE filename = ?
                LIMIT 1
                """)) {

            stmt.setString(1, filename);

            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next();
            }
        }
    }

    public void insert(String filename, Cursor cursor) throws SQLException {

        try (PreparedStatement stmt = connection.prepareStatement("""
                INSERT INTO files(filename, world, chunkX, chunkZ, x, y, z)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """)) {

            stmt.setString(1, filename);
            stmt.setString(2, cursor.world().getUID().toString());
            stmt.setInt(3, cursor.chunkX());
            stmt.setInt(4, cursor.chunkZ());
            stmt.setInt(5, cursor.x());
            stmt.setInt(6, cursor.y());
            stmt.setInt(7, cursor.z());

            stmt.executeUpdate();
        }
    }

    public void close() throws SQLException {
        connection.close();
    }
}
