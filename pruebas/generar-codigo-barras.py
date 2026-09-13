# Genera un video Y4M con un código de barras EAN-13 para simular la cámara.
L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
R = [''.join('1' if c=='0' else '0' for c in p) for p in L]
PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def ean13(codigo):
    d = [int(c) for c in codigo]
    assert len(d) == 13
    bits = '101'
    for i, par in enumerate(PAR[d[0]]):
        bits += (L if par == 'L' else G)[d[i+1]]
    bits += '01010'
    for i in range(7, 13):
        bits += R[d[i]]
    return bits + '101'

import sys
LEJOS = len(sys.argv) > 1 and sys.argv[1] == 'lejos'
W, H, FRAMES = 640, 480, 160
def digito_verificador(doce):
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(doce))
    return str((10 - s % 10) % 10)

BASE = '750105530001'
CODIGO = BASE + digito_verificador(BASE)
bits = ean13(CODIGO)
mod = 1 if LEJOS else 4                  # ancho de cada módulo en píxeles
ancho_barras = len(bits) * mod           # 95 * 4 = 380
x0 = (W - ancho_barras) // 2
y0, y1 = (200, 280) if LEJOS else (140, 340)

fila_base = bytearray([235]) * W         # blanco
fila_barra = bytearray(fila_base)
for i, b in enumerate(bits):
    if b == '1':
        for x in range(x0 + i*mod, x0 + (i+1)*mod):
            fila_barra[x] = 16           # negro

y_plane = bytearray()
for y in range(H):
    y_plane += fila_barra if y0 <= y < y1 else fila_base
uv = bytearray([128]) * (W*H//4)

salida = '/tmp/barras-lejos.y4m' if LEJOS else '/tmp/barras.y4m'
with open(salida,'wb') as f:
    f.write(b'YUV4MPEG2 W%d H%d F15:1 Ip A1:1 C420mpeg2\n' % (W, H))
    for _ in range(FRAMES):
        f.write(b'FRAME\n'); f.write(y_plane); f.write(uv); f.write(uv)
print('video listo:', salida, '· código', CODIGO, '· módulo', mod, 'px')
