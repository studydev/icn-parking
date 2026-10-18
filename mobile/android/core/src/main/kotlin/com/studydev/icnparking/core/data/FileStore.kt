package com.studydev.icnparking.core.data

import java.io.File
import java.time.Instant

/** 받은 원본 JSON을 그대로 저장하는 디스크 캐시. 파일 수정 시각 = 받은 시각. iOS FileStore와 같은 구조 */
class FileStore(root: File) {
    val directory: File = File(root, "v$SCHEMA_VERSION")

    init {
        root.mkdirs()
        root.listFiles()?.filter { it.isDirectory && it.name.startsWith("v") && it.name != directory.name }?.forEach { it.deleteRecursively() }
        File(directory, "days").mkdirs()
    }

    class Entry(val bytes: ByteArray, val fetchedAt: Instant)

    fun read(path: String): Entry? {
        val file = File(directory, path)
        if (!file.isFile) return null
        return runCatching { Entry(file.readBytes(), Instant.ofEpochMilli(file.lastModified())) }.getOrNull()
    }

    fun write(path: String, bytes: ByteArray, fetchedAt: Instant) {
        val file = File(directory, path)
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeBytes(bytes)
        tmp.setLastModified(fetchedAt.toEpochMilli())
        if (!tmp.renameTo(file)) {
            file.delete()
            tmp.renameTo(file)
        }
    }

    companion object {
        /** 저장 형식이나 확정 규칙이 바뀌면 올린다. 다른 버전 디렉터리는 열 때 지운다. */
        const val SCHEMA_VERSION = 1
    }
}
