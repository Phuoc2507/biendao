from choreo.videocard.matting import pick_providers


def test_pick_providers_cpu_only():
    assert pick_providers(["CPUExecutionProvider"]) == ["CPUExecutionProvider"]


def test_pick_providers_prefers_gpu():
    got = pick_providers(["DmlExecutionProvider", "CPUExecutionProvider", "CUDAExecutionProvider"])
    assert got == ["CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"]
