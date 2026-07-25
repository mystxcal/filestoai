from pathlib import Path

from core import collect_files, generate_output_content


def test_collect_files_respects_nested_gitignore(tmp_path: Path):
    frontend = tmp_path / "frontend"
    node_modules = frontend / "node_modules"
    node_modules.mkdir(parents=True)
    (frontend / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
    (frontend / "app.js").write_text("export const ready = true;\n", encoding="utf-8")
    (node_modules / "dependency.js").write_text("ignored\n", encoding="utf-8")

    files = collect_files(tmp_path, respect_gitignore=True)

    assert "frontend/app.js" in files
    assert "frontend/node_modules/dependency.js" not in files


def test_generate_output_reports_size_limited_files(tmp_path: Path):
    (tmp_path / "small.txt").write_text("hello\n", encoding="utf-8")
    (tmp_path / "large.txt").write_text("x" * 2048, encoding="utf-8")

    result = generate_output_content(
        ["small.txt", "large.txt"],
        tmp_path,
        max_size_kb=1,
    )

    assert "hello" in result["files_txt"]
    assert "exceeds limit of 1 KB" in result["files_txt"]
    assert result["stats"]["total_files"] == 2
    assert result["stats"]["skipped_files"] == 1
