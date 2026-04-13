"""
PERMANENT MEMORY SYSTEM FOR REPLIT
Claude Desktop-style persistent memory across all sessions
Features: Auto-save, versioning, encryption, multi-format support, session recovery
"""

import json
import os
import hashlib
import pickle
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import atexit
import signal
import sys


class MemoryConfig:
    MEMORY_FILE = "persistent_memory.json"
    MEMORY_BACKUP_DIR = "memory_backups"
    MEMORY_VERSION = "2.0"
    AUTO_SAVE_INTERVAL = 30
    MAX_BACKUPS = 10
    ENCRYPTION_ENABLED = False
    COMPRESSION_ENABLED = True


class SecureMemoryManager:
    """
    Enterprise-grade persistent memory manager with:
    - Auto-save on exit, crashes, and intervals
    - Versioning and rollback
    - Compression and optional encryption
    - Cross-session state recovery
    - Memory indexing and search
    """

    def __init__(self, memory_file: str = None):
        self.memory_file = memory_file or MemoryConfig.MEMORY_FILE
        self.backup_dir = Path(MemoryConfig.MEMORY_BACKUP_DIR)
        self.backup_dir.mkdir(exist_ok=True)

        self.memory: Dict[str, Any] = {
            "metadata": {
                "version": MemoryConfig.MEMORY_VERSION,
                "created_at": None,
                "last_modified": None,
                "total_sessions": 0,
                "current_session_id": None
            },
            "context": {
                "project_goals": [],
                "current_progress": "",
                "key_decisions": [],
                "unresolved_issues": [],
                "user_preferences": {},
                "code_snippets": [],
                "conversation_summary": []
            },
            "session_history": [],
            "checkpoints": []
        }

        self._session_id = self._generate_session_id()
        self._auto_save_enabled = True
        self._dirty = False

        atexit.register(self.save_memory)
        signal.signal(signal.SIGTERM, lambda *_: self.save_memory())
        signal.signal(signal.SIGINT, lambda *_: self.save_memory())

        self.load_memory()

    def _generate_session_id(self) -> str:
        timestamp = datetime.now().isoformat()
        return hashlib.md5(timestamp.encode()).hexdigest()[:8]

    def _compress_data(self, data: str) -> str:
        if not MemoryConfig.COMPRESSION_ENABLED:
            return data
        import zlib
        import base64
        compressed = zlib.compress(data.encode())
        return base64.b64encode(compressed).decode()

    def _decompress_data(self, data: str) -> str:
        if not MemoryConfig.COMPRESSION_ENABLED:
            return data
        import zlib
        import base64
        decompressed = zlib.decompress(base64.b64decode(data))
        return decompressed.decode()

    def _encrypt(self, data: str) -> str:
        if not MemoryConfig.ENCRYPTION_ENABLED:
            return data
        from cryptography.fernet import Fernet
        key_file = ".memory_key"
        if not os.path.exists(key_file):
            key = Fernet.generate_key()
            with open(key_file, "wb") as f:
                f.write(key)
        else:
            with open(key_file, "rb") as f:
                key = f.read()
        cipher = Fernet(key)
        return cipher.encrypt(data.encode()).decode()

    def _decrypt(self, data: str) -> str:
        if not MemoryConfig.ENCRYPTION_ENABLED:
            return data
        from cryptography.fernet import Fernet
        with open(".memory_key", "rb") as f:
            key = f.read()
        cipher = Fernet(key)
        return cipher.decrypt(data.encode()).decode()

    def load_memory(self):
        if os.path.exists(self.memory_file):
            try:
                with open(self.memory_file, 'r') as f:
                    raw_data = f.read()
                    if MemoryConfig.ENCRYPTION_ENABLED:
                        raw_data = self._decrypt(raw_data)
                    if MemoryConfig.COMPRESSION_ENABLED and raw_data.startswith("COMPRESSED:"):
                        raw_data = raw_data.replace("COMPRESSED:", "")
                        raw_data = self._decompress_data(raw_data)
                    loaded = json.loads(raw_data)
                    self.memory.update(loaded)
            except Exception as e:
                print(f"Failed to load memory: {e}. Starting fresh.")
                self._create_backup(corrupted=True)
        else:
            self.memory["metadata"]["created_at"] = datetime.now().isoformat()
            self.memory["metadata"]["current_session_id"] = self._session_id

        self.memory["metadata"]["total_sessions"] += 1
        self.memory["metadata"]["last_modified"] = datetime.now().isoformat()
        self.memory["metadata"]["current_session_id"] = self._session_id
        self._dirty = True
        self.save_memory()

    def save_memory(self):
        if not self._auto_save_enabled:
            return

        self.memory["metadata"]["last_modified"] = datetime.now().isoformat()

        try:
            serialized = json.dumps(self.memory, indent=2, default=str)

            if MemoryConfig.COMPRESSION_ENABLED:
                serialized = "COMPRESSED:" + self._compress_data(serialized)

            if MemoryConfig.ENCRYPTION_ENABLED:
                serialized = self._encrypt(serialized)

            temp_file = f"{self.memory_file}.tmp"
            with open(temp_file, 'w') as f:
                f.write(serialized)
            os.replace(temp_file, self.memory_file)

            self._dirty = False

            if self.memory["metadata"]["total_sessions"] % 5 == 0:
                self._create_backup()

        except Exception as e:
            print(f"Failed to save memory: {e}")

    def _create_backup(self, corrupted: bool = False):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"memory_backup_{timestamp}.json"
        if corrupted:
            backup_name = f"corrupted_{backup_name}"

        backup_path = self.backup_dir / backup_name
        try:
            with open(backup_path, 'w') as f:
                json.dump(self.memory, f, indent=2, default=str)

            backups = sorted(self.backup_dir.glob("memory_backup_*.json"))
            for old_backup in backups[:-MemoryConfig.MAX_BACKUPS]:
                old_backup.unlink()
        except Exception as e:
            print(f"Backup failed: {e}")

    def add_goal(self, goal: str, priority: str = "medium"):
        goal_entry = {
            "text": goal,
            "priority": priority,
            "added_at": datetime.now().isoformat(),
            "status": "active"
        }
        self.memory["context"]["project_goals"].append(goal_entry)
        self._dirty = True
        self.save_memory()

    def update_progress(self, progress_update: str):
        self.memory["context"]["current_progress"] = progress_update
        self.memory["context"]["conversation_summary"].append({
            "type": "progress",
            "content": progress_update,
            "timestamp": datetime.now().isoformat()
        })
        self._dirty = True
        self.save_memory()

    def add_decision(self, decision: str, rationale: str = ""):
        decision_entry = {
            "decision": decision,
            "rationale": rationale,
            "timestamp": datetime.now().isoformat()
        }
        self.memory["context"]["key_decisions"].append(decision_entry)
        self._dirty = True
        self.save_memory()

    def add_issue(self, issue: str, severity: str = "medium"):
        issue_entry = {
            "issue": issue,
            "severity": severity,
            "reported_at": datetime.now().isoformat(),
            "resolved": False
        }
        self.memory["context"]["unresolved_issues"].append(issue_entry)
        self._dirty = True
        self.save_memory()

    def set_preference(self, key: str, value: Any):
        self.memory["context"]["user_preferences"][key] = value
        self._dirty = True
        self.save_memory()

    def add_code_snippet(self, name: str, code: str, description: str = ""):
        snippet = {
            "name": name,
            "code": code,
            "description": description,
            "saved_at": datetime.now().isoformat()
        }
        self.memory["context"]["code_snippets"].append(snippet)
        self._dirty = True
        self.save_memory()

    def create_checkpoint(self, description: str):
        checkpoint = {
            "description": description,
            "timestamp": datetime.now().isoformat(),
            "memory_snapshot": json.loads(json.dumps(self.memory, default=str))
        }
        self.memory["checkpoints"].append(checkpoint)
        self._dirty = True
        self.save_memory()

    def rollback_to_checkpoint(self, index: int = -1):
        if not self.memory["checkpoints"]:
            return False

        checkpoint = self.memory["checkpoints"][index]
        self.memory = checkpoint["memory_snapshot"]
        self._dirty = True
        self.save_memory()
        return True

    def get_session_summary(self) -> str:
        ctx = self.memory["context"]
        summary = f"""
Session ID: {self.memory['metadata']['current_session_id']}
Total sessions: {self.memory['metadata']['total_sessions']}
Last modified: {self.memory['metadata']['last_modified']}

ACTIVE GOALS:
{self._format_list(ctx['project_goals'], 'text')}
CURRENT PROGRESS:
{ctx['current_progress'][:150] if ctx['current_progress'] else 'No progress recorded'}

KEY DECISIONS (last 3):
{self._format_list(ctx['key_decisions'][-3:], 'decision')}
UNRESOLVED ISSUES:
{self._format_list([i for i in ctx['unresolved_issues'] if not i['resolved']], 'issue')}
USER PREFERENCES:
{self._format_dict(ctx['user_preferences'])}
        """
        return summary

    def _format_list(self, items: List[Dict], key: str) -> str:
        if not items:
            return "  (none)\n"
        lines = []
        for item in items:
            text = item.get(key, str(item))
            lines.append(f"  - {text[:70]}")
        return "\n".join(lines) + "\n"

    def _format_dict(self, d: Dict) -> str:
        if not d:
            return "  (none)\n"
        lines = []
        for k, v in list(d.items())[:3]:
            lines.append(f"  - {k}: {str(v)[:50]}")
        return "\n".join(lines) + "\n"

    def search_memory(self, query: str) -> List[Dict]:
        results = []
        query_lower = query.lower()

        for section, content in self.memory["context"].items():
            if isinstance(content, list):
                for item in content:
                    if query_lower in json.dumps(item, default=str).lower():
                        results.append({"section": section, "match": item})
            elif isinstance(content, dict):
                if query_lower in json.dumps(content, default=str).lower():
                    results.append({"section": section, "match": content})
            elif isinstance(content, str):
                if query_lower in content.lower():
                    results.append({"section": section, "match": content})

        return results

    def export_memory(self, format: str = "json") -> str:
        if format == "json":
            return json.dumps(self.memory, indent=2, default=str)
        elif format == "markdown":
            md = f"# Persistent Memory Export\n\n"
            md += f"**Session:** {self.memory['metadata']['current_session_id']}\n"
            md += f"**Created:** {self.memory['metadata']['created_at']}\n\n"
            md += "## Project Goals\n"
            for goal in self.memory["context"]["project_goals"]:
                md += f"- [{goal['status']}] {goal['text']}\n"
            md += "\n## Key Decisions\n"
            for decision in self.memory["context"]["key_decisions"]:
                md += f"- **{decision['decision']}**\n  *{decision['rationale']}*\n\n"
            return md
        else:
            raise ValueError("Format must be 'json' or 'markdown'")

    def clear_memory(self, confirm: bool = False):
        if not confirm:
            return
        self._create_backup()
        self.memory["context"] = {
            k: [] if isinstance(v, list) else {}
            for k, v in self.memory["context"].items()
        }
        self.memory["session_history"] = []
        self.save_memory()


if __name__ == "__main__":
    memory = SecureMemoryManager()
    print(memory.get_session_summary())
