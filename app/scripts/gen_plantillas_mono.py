# -*- coding: utf-8 -*-
"""
Generador de plantillas de contrato de MONO NEGOCIOS SpA (77.096.809-7).
Base: contrato tipo Cocinero plazo fijo (formato Gastronómica Aste, jul-2026)
entregado por Cristian. La jornada queda 100% en placeholders
({HORAS_SEMANALES} / {DISTRIBUCION_JORNADA}) para que la misma plantilla
sirva part time y full time.
Ejecutar:  py scripts/gen_plantillas_mono.py   (desde app/)
"""
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH as AL
from docx.enum.table import WD_TABLE_ALIGNMENT

OUT = "plantillas/MONO NEGOCIOS 77096809-7/CONTRATO Cocinero - Plazo Fijo.docx"


def build(out_path: str):
    d = Document()
    d.styles["Normal"].paragraph_format.space_after = Pt(0)

    def cab(t):
        p = d.add_paragraph(); p.alignment = AL.CENTER; r = p.add_run(t); r.bold = True

    def vacio():
        d.add_paragraph()

    def cl(lead, resto=""):
        p = d.add_paragraph(); p.alignment = AL.JUSTIFY
        if lead:
            r = p.add_run(lead); r.bold = True
        if resto:
            p.add_run(resto)

    def li(t, bold=False):
        p = d.add_paragraph(); p.alignment = AL.JUSTIFY
        p.paragraph_format.left_indent = Pt(18)
        r = p.add_run(t); r.bold = bold

    cab("CONTRATO INDIVIDUAL DE TRABAJO A PLAZO FIJO")
    cab("{CARGO}")
    vacio()
    cl("", 'En {CIUDAD_FIRMA}, a {FECHA_INICIO_CONTRATO}, entre {RAZON_SOCIAL}, RUT {RUT_EMPRESA}, representada por don {NOMBRE_REP_LEGAL}, RUT {RUT_REP_LEGAL}, ambos domiciliados en {DIRECCION_EMPRESA}, comuna de {COMUNA_EMPRESA}, correo electrónico {EMAIL_EMPRESA}, que en adelante se denominará "el Empleador", y don(ña) {NOMBRE_EMPLEADO}, de nacionalidad {NACIONALIDAD_EMPLEADO}, RUT {RUT_EMPLEADO}, fecha de nacimiento {FECHA_NACIMIENTO}, de estado civil {ESTADO_CIVIL}, con domicilio en {DIRECCION_EMPLEADO}, comuna de {COMUNA_EMPLEADO}, correo electrónico {EMAILPERSONAL_EMPLEADO}, que en adelante se denominará "el Trabajador", se ha convenido en el siguiente contrato de trabajo:')
    vacio()
    cl("PRIMERO: Naturaleza de los Servicios. ", "El Trabajador asume el cargo de {CARGO}, siendo responsable de la preparación y producción de los productos de la carta conforme a los estándares de calidad, higiene y tiempos definidos por el Empleador. El Trabajador se compromete y obliga a realizar el trabajo como {CARGO}, desempeñando labores en el área indicada por el Empleador y otras del giro, las cuales han de prestarse en las dependencias del Empleador, ubicadas en {DIRECCION_EMPRESA}, comuna de {COMUNA_EMPRESA}, pudiendo prestar servicios también en sucursales de la empresa. El Trabajador podrá ser trasladado a otro domicilio o a labores similares, dentro de la Región de Valparaíso, por causa justificada, sin que ello importe menoscabo para el Trabajador.")
    cl("Funciones, Responsabilidades, Obligaciones y Prohibiciones Específicas:")
    cl("A. Funciones")
    li("1. Preparación y producción: preparar, cocinar y montar los productos de la carta según las recetas y estándares de calidad del local, garantizando su correcta presentación y tiempos de salida.")
    li("2. Mise en place: realizar la preparación previa de insumos (cortes, salsas, porcionado y marinado) antes de cada servicio, dejando su estación lista para operar.")
    li("3. Manejo de estaciones y equipos: operar freidoras, planchas, hornos, refrigeradores y demás equipos de cocina de forma segura y responsable.")
    li("4. Seguridad e Higiene (HACCP): cumplir el Reglamento Sanitario de los Alimentos, controlar temperaturas, manipular higiénicamente los alimentos y mantener el aseo de su estación y de los equipos a su cargo.")
    li("5. Control de insumos: recepcionar y almacenar la mercadería bajo estricto sistema FIFO (primero en entrar, primero en salir), minimizando mermas e informando oportunamente a su jefatura las necesidades de reposición.")
    li("6. Funciones conexas: dada la dinámica del establecimiento, el Trabajador acepta colaborar en tareas conexas ante necesidades operativas, tales como apoyo en el lavado de vajilla (copería) en momentos críticos o cierre de local, sin que ello signifique menoscabo.")
    cl("B. Obligaciones.")
    li("1. Llegar puntualmente a su lugar de trabajo.")
    li("2. Realizar personalmente la labor convenida.")
    li("3. Efectuar el trabajo de acuerdo con las órdenes e instrucciones que emanen de la administración de la empresa, como asimismo las recibidas de sus jefes directos.")
    li("4. Ser respetuoso con sus superiores y compañeros de trabajo, y observar las órdenes que los primeros impartan en orden al buen servicio y/o los intereses de la empresa.")
    li("5. Registrar diariamente su hora de entrada y salida en el Libro de Asistencia o mecanismo afín. Se considerará falta grave que el trabajador registre indebidamente su asistencia en el Libro o que éste sea firmado por otro u otros funcionarios.")
    li("6. Observar, en todo momento, una conducta correcta y honorable, y desempeñar sus funciones con dignidad y responsabilidad.")
    li("7. Cumplir íntegramente la jornada diaria y semanal de trabajo a la que se encuentre afecto.")
    li("8. Informar, mínimo sesenta minutos antes del inicio de sus labores, cualquier impedimento que lo haya imposibilitado de concurrir, justificando su inasistencia dentro de las cuarenta y ocho horas a partir de ese momento, con la respectiva licencia médica.")
    li("9. Dar aviso de inmediato de cualquier desperfecto que se detecte en los elementos de trabajo o instalaciones de la empresa, a efecto de evitar daños mayores.")
    li("10. Mantener en orden, higiene y aseo el lugar donde desempeñe sus labores.")
    li("11. Mantener siempre una excelente presencia y aspecto personal.")
    li("12. Cuidar con esmero las máquinas, implementos, equipos, instalaciones y útiles que se le entreguen para el desempeño de sus labores, los cuales deberá dejar limpios y/o guardados al término de su jornada.")
    li("13. Proceder a devolver todos los elementos puestos a su servicio antes de cursar la firma del respectivo finiquito legal.")
    cl("C. Prohibiciones.")
    li("1. Consumo de Alcohol y Drogas: queda estrictamente prohibido consumir alcohol durante el horario laboral, ya sea del inventario del local o ingresado de forma oculta a su lugar de trabajo; asimismo, el consumo, manipulación o tráfico de drogas dentro de su jornada laboral (incluyendo descanso).")
    li("2. Trato al Cliente: discusiones, faltas de respeto o negligencia que afecten la imagen del local.")
    li("3. Seguridad: dejar el local abierto o sin alarma de cierre, o, de manera negligente, permitir sustracciones de insumos, dinero o productos del local.")
    cl("", "El incumplimiento de alguna de las disposiciones indicadas en los puntos A, B y C, así como el incurrir en alguna de las prohibiciones, constituye incumplimiento grave de las obligaciones que le impone el contrato, siendo causal suficiente para poner término inmediato a éste.")
    vacio()
    cl("SEGUNDO: ", "El Trabajador cumplirá una jornada de trabajo de {HORAS_SEMANALES} horas semanales, distribuida de la siguiente forma: {DISTRIBUCION_JORNADA}. Con todo, el Trabajador destinará una hora de colación diaria, no imputable a la jornada de trabajo. Sin perjuicio de lo anterior, las partes podrán modificar la distribución y extensión del horario en función de las necesidades operacionales de la empresa, siempre respetando el máximo semanal permitido (con un plazo mínimo de 24 horas antes de informar dicho cambio).")
    vacio()
    cl("TERCERO: ", "El Empleador se compromete a remunerar al Trabajador en la forma que se indica:")
    li("1) Sueldo Base: $ {SUELDO_BASE} ({SUELDO_BASE_PALABRA}).")
    li("2) Asignación de Movilización: $ {ASIGNACION_MOVILIZACION} ({ASIGNACION_MOVILIZACION_PALABRA}).")
    li("3) Asignación de Colación: $ {ASIGNACION_COLACION} ({ASIGNACION_COLACION_PALABRA}).")
    vacio()
    cl("CUARTO: ", "{GRATIFICACION_TEXTO} Las remuneraciones antes referidas quedarán afectas a los descuentos previsionales y tributarios que correspondan y a los demás que autorice la ley. El Trabajador acepta y autoriza, desde ya, que pueda descontarse de su remuneración el tiempo no trabajado, sea por permisos, atrasos, faltas, rotura de implementos u otros motivos, como también por anticipos de remuneración solicitados por él, siempre y cuando disponga de los materiales necesarios para desempeñar sus funciones dentro del local.")
    vacio()
    cl("QUINTO: Confidencialidad. ", "Prohibición absoluta de divulgar recetas, preparaciones de cocina, bases de datos de clientes o cifras de venta del local. El Trabajador se obliga a no entregar, revelar, divulgar ni comunicar a ninguna persona, salvo a sus superiores jerárquicos o a la administración de {RAZON_SOCIAL}, cualquier información, antecedente, cifra o dato relativo a las actividades comerciales y/o financieras de {RAZON_SOCIAL} y/o de empresas relacionadas comercialmente a ésta (clientes, proveedores, relacionados comerciales, etc.), a las cuales pudiere tener acceso de acuerdo con el desarrollo de su cargo. La infracción a esta norma supone incumplimiento grave de las obligaciones que impone el contrato.")
    vacio()
    cl("SEXTO: ", "El presente contrato tendrá el carácter de plazo fijo, con vigencia desde el {FECHA_INICIO_CONTRATO} hasta el {FECHA_TERMINO_CONTRATO}, fecha esta última en que terminará sin necesidad de aviso previo, salvo que las partes acuerden por escrito su prórroga o renovación.")
    vacio()
    cl("SÉPTIMO: ", "Se entienden incorporadas al presente contrato todas las disposiciones legales que se dicten con posterioridad a la fecha de suscripción y que tengan relación con él.")
    vacio()
    cl("OCTAVO: ", "Se deja constancia que el Trabajador ingresó a prestar servicios para el Empleador con fecha {FECHA_INICIO_CONTRATO}.")
    vacio()
    cl("NOVENO: ", "El Trabajador podrá hacer uso de su feriado legal anual cuando le corresponda según la ley. Sin embargo, el Empleador se reserva el derecho de establecer la época en que ello resulte conveniente, habida consideración de las necesidades del servicio de su giro.")
    vacio()
    cl("DÉCIMO: ", "Toda modificación que se introduzca al presente contrato o a su anexo deberá constar por escrito, a su dorso o en una hoja de prolongación colocada a continuación, y deberá estar firmada por el trabajador y el empleador.")
    vacio()
    cl("DÉCIMO PRIMERO: ", "Las cartas de amonestación son el medio utilizado por el empleador para comunicar al trabajador los incumplimientos en que ha incurrido, los cuales, de persistir, dan derecho al empleador para poner término al contrato de trabajo por incumplimiento grave de las obligaciones que éste impone o la causal que corresponda.")
    vacio()
    cl("DÉCIMO SEGUNDO: ", "Para todos los efectos legales derivados de este contrato, las partes fijan su domicilio en la ciudad y comuna de Viña del Mar, sometiéndose a la jurisdicción y competencia de sus Tribunales de Justicia.")
    vacio()
    cl("DÉCIMO TERCERO: ", "Se suscribe este instrumento en dos ejemplares de igual tenor, quedando uno de ellos en poder del empleador y el restante en poder del trabajador, quien declara recibirlo en este acto.")
    vacio(); vacio()
    tb = d.add_table(rows=3, cols=2); tb.alignment = WD_TABLE_ALIGNMENT.CENTER
    filas = [("{RAZON_SOCIAL}", "{NOMBRE_EMPLEADO}"),
             ("RUT {RUT_EMPRESA}", "RUT {RUT_EMPLEADO}"),
             ("EMPLEADOR", "TRABAJADOR")]
    for i, (a, b) in enumerate(filas):
        c = tb.rows[i].cells
        for cell, txt in ((c[0], a), (c[1], b)):
            cell.paragraphs[0].alignment = AL.CENTER
            cell.paragraphs[0].add_run(txt)
    d.save(out_path)
    print("Generado:", out_path, "| párrafos:", len(d.paragraphs))


if __name__ == "__main__":
    import os
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    build(OUT)
