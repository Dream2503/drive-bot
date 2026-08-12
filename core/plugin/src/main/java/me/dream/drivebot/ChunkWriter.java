package me.dream.drivebot;

import org.bukkit.Material;
import org.bukkit.World;

import java.util.List;

public final class ChunkWriter {

    private ChunkWriter() {
    }

    public static Cursor write(Cursor cursor, List<Integer> data) {

        World world = cursor.world();

        for (int id : data) {

            Material material = BlockPalette.get(id);

            world.getBlockAt(cursor.chunkX() * 16 + cursor.x(), cursor.y(), cursor.chunkZ() * 16 + cursor.z()).setType(material, false);

            cursor = cursor.increment();
        }

        return cursor;
    }

    public static int capacity(World world) {
        return (world.getMaxHeight() - world.getMinHeight()) * 16 * 16;
    }
}