"""Storage abstraction: local filesystem (dev/tests) or Azure Blob (managed identity)."""
import gzip
import json
import os
from pathlib import Path
from typing import Protocol


class Store(Protocol):
    def get(self, path: str) -> bytes | None: ...
    def put(self, path: str, data: bytes, *, content_type: str = "application/octet-stream",
            content_encoding: str | None = None, cache_control: str | None = None) -> None: ...
    def append(self, path: str, data: bytes) -> None: ...
    def list(self, prefix: str) -> list[str]: ...


class LocalStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _p(self, path: str) -> Path:
        return self.root / path

    def get(self, path):
        p = self._p(path)
        return p.read_bytes() if p.exists() else None

    def put(self, path, data, *, content_type="application/octet-stream", content_encoding=None, cache_control=None):
        p = self._p(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)

    def append(self, path, data):
        p = self._p(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("ab") as f:
            f.write(data)

    def list(self, prefix):
        base = self.root
        return sorted(str(p.relative_to(base)) for p in base.rglob("*")
                      if p.is_file() and not p.name.endswith(".tmp") and str(p.relative_to(base)).startswith(prefix))


class BlobStore:
    def __init__(self, container: str, account_url: str | None = None, connection_string: str | None = None):
        from azure.storage.blob import BlobServiceClient

        if connection_string:
            svc = BlobServiceClient.from_connection_string(connection_string)
        else:
            from azure.identity import DefaultAzureCredential

            client_id = os.environ.get("AZURE_CLIENT_ID")
            cred = DefaultAzureCredential(managed_identity_client_id=client_id) if client_id else DefaultAzureCredential()
            svc = BlobServiceClient(account_url, credential=cred)
        self.cc = svc.get_container_client(container)

    def get(self, path):
        from azure.core.exceptions import ResourceNotFoundError

        try:
            return self.cc.download_blob(path, decompress=False).readall()
        except ResourceNotFoundError:
            return None

    def put(self, path, data, *, content_type="application/octet-stream", content_encoding=None, cache_control=None):
        from azure.storage.blob import ContentSettings

        self.cc.upload_blob(path, data, overwrite=True, content_settings=ContentSettings(
            content_type=content_type, content_encoding=content_encoding, cache_control=cache_control))

    def append(self, path, data):
        from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

        bc = self.cc.get_blob_client(path)
        try:
            bc.append_block(data)
        except ResourceNotFoundError:
            try:
                bc.create_append_blob(content_settings=None, if_none_match="*")
            except ResourceExistsError:
                pass
            bc.append_block(data)

    def list(self, prefix):
        return sorted(self.cc.list_blob_names(name_starts_with=prefix))

    def put_append(self, path, data):
        """Replace an append blob with new content (used by rebuilds so later appends keep working)."""
        bc = self.cc.get_blob_client(path)
        bc.create_append_blob()
        for i in range(0, len(data), 4 * 1024 * 1024):
            bc.append_block(data[i:i + 4 * 1024 * 1024])


def get_json(store: Store, path: str):
    raw = store.get(path)
    if raw is None:
        return None
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)


def put_json(store: Store, path: str, obj, *, gz: bool = False, cache_control: str | None = None) -> None:
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if gz:
        data = gzip.compress(data, compresslevel=9, mtime=0)
    store.put(path, data, content_type="application/json", content_encoding="gzip" if gz else None,
              cache_control=cache_control)


def stores_from_env() -> tuple[Store, Store]:
    """(private, web) stores. LOCAL_DATA_DIR selects the filesystem backend."""
    local = os.environ.get("LOCAL_DATA_DIR")
    if local:
        return LocalStore(Path(local) / "private"), LocalStore(Path(local) / "web")
    conn = os.environ.get("DATA_STORAGE_CONNECTION_STRING")
    url = os.environ.get("DATA_STORAGE_ACCOUNT_URL")
    return (BlobStore(os.environ.get("PRIVATE_CONTAINER", "private"), url, conn),
            BlobStore(os.environ.get("WEB_CONTAINER", "$web"), url, conn))
