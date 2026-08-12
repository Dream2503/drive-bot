package me.dream.drivebot;

import org.jspecify.annotations.NonNull;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class FileEncoder {
    private static final int HEADER_SIZE = Integer.BYTES;

    public static List<Integer> encode(Path path) throws IOException {
        byte[] file = Files.readAllBytes(path);
        ByteBuffer buffer = ByteBuffer.allocate(file.length + HEADER_SIZE);

        buffer.putInt(file.length);
        buffer.put(file);

        return packBits(BlockPalette.bitsPerBlock(), buffer.array());
    }

    private static @NonNull List<Integer> packBits(int bitsPerBlock, byte[] bytes) {
        int mask = (1 << bitsPerBlock) - 1;
        int totalBits = bytes.length * Byte.SIZE;
        int blockCount = (totalBits + bitsPerBlock - 1) / bitsPerBlock;
        List<Integer> output = new ArrayList<>(blockCount);
        long bitBuffer = 0;
        int bufferedBits = 0;

        for (byte b : bytes) {
            bitBuffer = (bitBuffer << Byte.SIZE) | (b & 0xFFL);
            bufferedBits += Byte.SIZE;

            while (bufferedBits >= bitsPerBlock) {
                bufferedBits -= bitsPerBlock;
                int value = (int)((bitBuffer >> bufferedBits) & mask);
                output.add(value);
            }
        }
        if (bufferedBits > 0) {
            int value = (int)((bitBuffer << (bitsPerBlock - bufferedBits)) & mask);
            output.add(value);
        }
        return output;
    }
}
