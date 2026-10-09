"""CLI thẻ video: phần không cần ffmpeg hay onnxruntime."""

from choreo.videocard import cli, ffio


def test_missing_ffmpeg_exit_code_and_hint(monkeypatch, capsys):
    monkeypatch.setattr(ffio, "find_ffmpeg", lambda: None)
    code = cli.main(["a.mp4", "--music", "m.mp3"])
    assert code == cli.EXIT_MISSING
    assert "pip install imageio-ffmpeg" in capsys.readouterr().err


def test_missing_model_hint(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(ffio, "find_ffmpeg", lambda: "ffmpeg")
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *a, **k):
        if name == "onnxruntime":
            return object()
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    code = cli.main(["a.mp4", "--model", str(tmp_path / "khong-co.onnx")])
    assert code == cli.EXIT_MISSING
    err = capsys.readouterr().err
    assert "rvm_mobilenetv3_fp32.onnx" in err


def test_card_meta_keys():
    m = cli.card_meta("Lan", stacked=True, duration=182.4049, width=300,
                      height=540, offset=3.2712, confident=True)
    assert m == {
        "format": "choreo-card", "version": 1, "name": "Lan", "stacked": True,
        "fps": 30, "durationSec": 182.405, "width": 300, "height": 540,
        "offsetSec": 3.271, "alignConfident": True,
    }
