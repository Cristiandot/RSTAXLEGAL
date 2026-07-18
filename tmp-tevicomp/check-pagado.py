import openpyxl
wb = openpyxl.load_workbook(r"C:\Users\CristianLópezThienel\OneDrive - Rodríguez Samith Tax & Legal Limitada\RSTL - Clientes\C.20 - Mauricio Miranda\TEVICOMP\02-Contab\TEVICOMP_2026_v9.xlsx", data_only=True, read_only=True)
for hoja, colP, colC in (("COMPRAS", "PAGADO", "Cuenta Gasto"), ("VENTAS", "PAGADO", "Cuenta Gasto")):
    ws = wb[hoja]
    filas = ws.iter_rows(values_only=True)
    enc = [str(c).strip() if c is not None else "" for c in next(filas)]
    iP = enc.index(colP) if colP in enc else None
    iC = enc.index(colC) if colC in enc else None
    pag, ctas = set(), set()
    n = 0
    for f in filas:
        if f is None or all(v is None for v in f): continue
        n += 1
        if iP is not None and iP < len(f): pag.add(str(f[iP]))
        if iC is not None and iC < len(f): ctas.add(str(f[iC]))
    print(hoja, "| filas:", n, "| PAGADO:", sorted(pag), "| Cuentas:", sorted(ctas))
