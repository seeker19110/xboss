#!/usr/bin/env python3
"""
scripts/font_shx_converter.py — Bộ Chuyển Đổi Bảng Mã Font CAD (TCVN3 / VNI / SHX sang Unicode UTF-8)
"""
import sys

TCVN3_TO_UNICODE = {
    '¸': 'à', 'µ': 'ả', '·': 'ã', '¹': 'á', '¹': 'ạ',
    '¨': 'ă', '»': 'ằ', '¾': 'ẳ', 'Æ': 'ẵ', '¾': 'ắ', 'Æ': 'ặ',
    'ê': 'ê', 'Ò': 'ò', 'Ó': 'ó', 'Õ': 'õ', 'Ö': 'ö',
    '®': 'đ', '§': 'Đ',
    'â': 'â', 'Ç': 'ầ', 'È': 'ẩ', 'É': 'ẫ', 'Ê': 'ấ', 'Ë': 'ậ',
    'è': 'è', 'é': 'é', 'ë': 'ẽ', 'è': 'ẻ', 'ẹ': 'ẹ',
    'ì': 'ì', 'í': 'í', 'ĩ': 'ĩ', 'ỉ': 'ỉ', 'ị': 'ị',
    'ò': 'ò', 'ó': 'ó', 'õ': 'õ', 'ỏ': 'ỏ', 'ọ': 'ọ',
    'ù': 'ù', 'ú': 'ú', 'ũ': 'ũ', 'ủ': 'ủ', 'ụ': 'ụ',
    'ý': 'ý', 'ỳ': 'ỳ', 'ỷ': 'ỷ', 'ỹ': 'ỹ', 'ỵ': 'ỵ'
}

VNI_TO_UNICODE = {
    'a1': 'á', 'a2': 'à', 'a3': 'ả', 'a4': 'ã', 'a5': 'ạ',
    'a8': 'ă', 'a81': 'ắ', 'a82': 'ằ', 'a83': 'ẳ', 'a84': 'ẵ', 'a85': 'ặ',
    'a6': 'â', 'a61': 'ấ', 'a62': 'ầ', 'a63': 'ẩ', 'a64': 'ẫ', 'a65': 'ậ',
    'e1': 'é', 'e2': 'è', 'e3': 'ẻ', 'e4': 'ẽ', 'e5': 'ẹ',
    'e6': 'ê', 'e61': 'ế', 'e62': 'ề', 'e63': 'ể', 'e64': 'ễ', 'e65': 'ệ',
    'i1': 'í', 'i2': 'ì', 'i3': 'ỉ', 'i4': 'ĩ', 'i5': 'ị',
    'o1': 'ó', 'o2': 'ò', 'o3': 'ỏ', 'o4': 'õ', 'o5': 'ọ',
    'o6': 'ô', 'o61': 'ố', 'o62': 'ồ', 'o63': 'ổ', 'o64': 'ỗ', 'o65': 'ộ',
    'o7': 'ơ', 'o71': 'ớ', 'o72': 'ờ', 'o73': 'ở', 'o74': 'ỡ', 'o75': 'ợ',
    'u1': 'ú', 'u2': 'ù', 'u3': 'ủ', 'u4': 'ũ', 'u5': 'ụ',
    'u7': 'ư', 'u71': 'ứ', 'u72': 'ừ', 'u73': 'ử', 'u74': 'ữ', 'u75': 'ự',
    'y1': 'ý', 'y2': 'ỳ', 'y3': 'ỷ', 'y4': 'ỹ', 'y5': 'ỵ',
    'd9': 'đ', 'D9': 'Đ'
}

def convert_tcvn3_to_utf8(text: str) -> str:
    """Chuyển đổi chuỗi TCVN3 sang Unicode UTF-8"""
    result = []
    for char in text:
        result.append(TCVN3_TO_UNICODE.get(char, char))
    return "".join(result)

def convert_vni_to_utf8(text: str) -> str:
    """Chuyển đổi chuỗi VNI sang Unicode UTF-8"""
    result = text
    # Thay thế các cụm 3 ký tự trước, sau đó tới 2 ký tự
    sorted_patterns = sorted(VNI_TO_UNICODE.keys(), key=len, reverse=True)
    for pattern in sorted_patterns:
        result = result.replace(pattern, VNI_TO_UNICODE[pattern])
        result = result.replace(pattern.upper(), VNI_TO_UNICODE[pattern].upper())
    return result

def clean_cad_text(text: str) -> str:
    """Loại bỏ mã điều khiển font AutoCAD (ví dụ \\P, %%u, %%c) và chuẩn hóa"""
    if not text:
        return ""
    # Chuyển đổi ký hiệu đường kính %%c -> Ø, góc %%d -> °
    cleaned = text.replace("%%c", "Ø").replace("%%C", "Ø").replace("%%d", "°").replace("%%p", "±")
    # Loại bỏ ngắt dòng MText \\P
    cleaned = cleaned.replace("\\P", "\n").replace("\\p", "\n")
    return cleaned

if __name__ == "__main__":
    sample = "OÁNG GIOÙ CAÁP %%c200"
    print("Cleaned text:", clean_cad_text(sample))
