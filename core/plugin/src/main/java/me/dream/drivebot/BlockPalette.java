package me.dream.drivebot;

import org.bukkit.Material;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class BlockPalette {

    private static final List<Material> PALETTE = new ArrayList<>();
    private static final Map<Material, Integer> IDS = new HashMap<>();

    private static int bitsPerBlock;

    private BlockPalette() {
    }

    public static void load(JavaPlugin plugin) throws IOException {

        PALETTE.clear();
        IDS.clear();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(plugin.getResource("palette.txt")))) {

            String line;

            while ((line = reader.readLine()) != null) {

                line = line.trim();

                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }

                Material material = Material.matchMaterial(line);

                if (material == null) {
                    throw new IllegalArgumentException("Unknown material: " + line);
                }

                if (!material.isBlock()) {
                    throw new IllegalArgumentException(line + " is not a block.");
                }

                PALETTE.add(material);
            }
        }

        if (PALETTE.isEmpty()) {
            throw new IllegalStateException("Palette is empty.");
        }

        int count = PALETTE.size();

        bitsPerBlock = 31 - Integer.numberOfLeadingZeros(count);

        int keep = 1 << bitsPerBlock;

        while (PALETTE.size() > keep) {
            PALETTE.removeLast();
        }

        for (int i = 0; i < PALETTE.size(); i++) {
            IDS.put(PALETTE.get(i), i);
        }
    }

    public static Material get(int id) {
        return PALETTE.get(id);
    }

    public static int getId(Material material) {

        Integer id = IDS.get(material);

        if (id == null) {
            throw new IllegalArgumentException("Material not in palette: " + material);
        }

        return id;
    }

    public static int size() {
        return PALETTE.size();
    }

    public static int bitsPerBlock() {
        return bitsPerBlock;
    }
}