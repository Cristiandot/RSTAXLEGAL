import openpyxl, json, datetime
wb = openpyxl.load_workbook(r"C:\Users\CristianLópezThienel\OneDrive - Rodríguez Samith Tax & Legal Limitada\RSTL - Clientes\C.20 - Mauricio Miranda\TEVICOMP\02-Contab\TEVICOMP_2026_v9.xlsx", data_only=True, read_only=True)
ws = wb["HONORARIOS"]
filas = list(ws.iter_rows(values_only=True))
enc = [str(c).strip() if c is not None else "" for c in filas[0]]
docs = []
for f in filas[1:]:
    if f is None or f[0] is None: continue
    d = {}
    for i, n in enumerate(enc):
        v = f[i] if i < len(f) else None
        if isinstance(v, datetime.datetime): v = v.strftime("%Y-%m-%d")
        d[n] = v
    docs.append(d)
with open(r"C:\Proyectos\RSTAXLEGAL\app\tmp-tevicomp\honorarios-workbook.json","w",encoding="utf-8") as fh:
    json.dump(docs, fh, ensure_ascii=False, indent=1)
print("filas:", len(docs))
