package me.dream.drivebot;

import org.bukkit.World;

public record Cursor(World world, int maxX, int maxZ, int chunkX, int chunkZ, int x, int y, int z) {

    public Cursor(World world, int maxX, int maxZ) {
        this(world, maxX, maxZ, 0, 0, 0, world.getMinHeight(), 0);
    }

    public Cursor increment() {

        int chunkX = this.chunkX;
        int chunkZ = this.chunkZ;
        int x = this.x;
        int y = this.y;
        int z = this.z;

        if (x < 15) {
            x++;
        } else {
            x = 0;

            if (z < 15) {
                z++;
            } else {
                z = 0;

                if (y < world.getMaxHeight() - 1) {
                    y++;
                } else {
                    y = world.getMinHeight();

                    if (chunkX < maxX) {
                        chunkX++;
                    } else {
                        chunkX = 0;

                        if (chunkZ < maxZ) {
                            chunkZ++;
                        } else {
                            throw new RuntimeException("Maximum limit reached");
                        }
                    }
                }
            }
        }
        return new Cursor(world, maxX, maxZ, chunkX, chunkZ, x, y, z);
    }
}
