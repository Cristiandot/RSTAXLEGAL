# -*- coding: utf-8 -*-
"""
Generador de plantillas de contrato de MONO NEGOCIOS SpA (77.096.809-7).
Base: contrato tipo "Part Time" de atención de cafetería entregado por
Cristian (jul-2026), local Av. Ignacio Carrera Pinto N° 184, Reñaca.
La jornada queda 100% en placeholders ({HORAS_SEMANALES} /
{DISTRIBUCION_JORNADA}) y la duración usa {TIPO_CONTRATO}, por lo que la
misma plantilla sirve part time / full time y plazo fijo / indefinido.
Ejecutar:  py scripts/gen_plantillas_mono.py   (desde app/)
"""
import os
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH as AL
from docx.enum.table import WD_TABLE_ALIGNMENT

OUT = "plantillas/MONO NEGOCIOS 77096809-7/CONTRATO Atencion del Local (PT-FT).docx"


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

    def li(t, indent=18, bold=False):
        p = d.add_paragraph(); p.alignment = AL.JUSTIFY
        p.paragraph_format.left_indent = Pt(indent)
        r = p.add_run(t); r.bold = bold

    cab("CONTRATO INDIVIDUAL DE TRABAJO")
    cab("{CARGO}")
    vacio()
    cl("", 'En Reñaca, a {FECHA_INICIO_CONTRATO}, entre {RAZON_SOCIAL}, RUT {RUT_EMPRESA}, representada por don {NOMBRE_REP_LEGAL}, Rut: {RUT_REP_LEGAL}, ambos domiciliados en Avenida Ignacio Carrera Pinto N° 184, Reñaca, Viña del Mar, correo electrónico {EMAIL_EMPRESA}, que en adelante se denominará "el empleador", y don(ña) {NOMBRE_EMPLEADO}, de nacionalidad {NACIONALIDAD_EMPLEADO}, Rut {RUT_EMPLEADO}, fecha de nacimiento {FECHA_NACIMIENTO}, de estado civil {ESTADO_CIVIL}, con domicilio {DIRECCION_EMPLEADO}, comuna de {COMUNA_EMPLEADO}, correo electrónico {EMAILPERSONAL_EMPLEADO}, que en adelante se denominará "el trabajador", se ha convenido en el siguiente contrato de trabajo:')
    vacio()
    cl("PRIMERO: Naturaleza de los Servicios. ", "El Trabajador se compromete y obliga a realizar el trabajo como {CARGO}, desempeñando labores en el área indicada por el empleador y otras del giro, las cuales han de prestarse en las dependencias del empleador, ubicadas en Avenida Ignacio Carrera Pinto N° 184, Reñaca, Viña del Mar. El trabajador podrá ser trasladado a otro domicilio o labores similares, dentro de la ciudad, por causa justificada, sin que ello importe menoscabo para el trabajador.")
    cl("Funciones, Responsabilidades, Obligaciones y Prohibiciones Específicas:")
    cl("A. Funciones")
    li("1. Atención al cliente y servicio a la mesa.")
    li("- Recepción cordial de clientes, entrega de cartas/menús y asesoría sobre los productos de la cafetería.", 30)
    li("- Toma de pedidos de manera ágil y exacta, ingresándolas en el sistema de comanda correspondiente.", 30)
    li("- Servicio de alimentos y bebidas (café, pastelería, sándwiches, etc.) en mesa o barra, cumpliendo con los estándares de presentación de la Empresa.", 30)
    li("2. Operación y Caja.")
    li("- Entrega de la cuenta y cobro de los servicios a través de los medios de pago disponibles (efectivo, tarjetas, transferencias).", 30)
    li("- Apoyo en la barra para la preparación básica de pedidos rápidos o despacho de productos envasados si la operación lo requiere.", 30)
    li("3. Higiene y Orden.")
    li("- Montaje, desmontaje y limpieza profunda de mesas y sillas inmediatamente después de su uso.", 30)
    li("- Mantención del aseo general del salón, barra y estaciones de trabajo, asegurando el cumplimiento de las normas sanitarias vigentes.", 30)
    li("- Orden y reposición de insumos (servilletas, azúcar, cubiertos, vitrinas) antes, durante y al cierre del turno.", 30)
    li("4. Funciones conexas: El Trabajador acepta colaborar en tareas conexas ante necesidades operativas, tales como apoyo en inventarios generales, cierre de local y verificación de aseo.")
    cl("B. Obligaciones.")
    li("1. Llegar puntualmente a su lugar de trabajo.")
    li("2. Realizar personalmente la labor convenida.")
    li("3. Efectuar el trabajo de acuerdo con las órdenes e instrucciones que emanen de la administración de la empresa, como, asimismo, las recibidas de sus jefes directos.")
    li("4. Ser respetuoso con sus superiores y compañeros de trabajo, y observar las órdenes que los primeros impartan en orden al buen servicio y/o los intereses de la empresa.")
    li("5. Registrar diariamente su hora de entrada y salida en el Libro de Asistencia o mecanismo afín. Se considerará falta grave que el trabajador registre indebidamente su asistencia en el Libro o que éste sea firmado por otro u otros funcionarios.")
    li("6. Observar, en todo momento, una conducta correcta y honorable, y desempeñar sus funciones con dignidad y responsabilidad.")
    li("7. Cumplir íntegramente la jornada diaria y semanal de trabajo a la que se encuentre afecto.")
    li("8. Informar, dentro de los sesenta minutos siguientes al inicio de sus labores, cualquier impedimento que lo haya imposibilitado de concurrir, justificando su inasistencia dentro de las cuarenta y ocho horas a partir de ese momento, con la respectiva licencia médica.")
    li("9. Dar aviso de inmediato de cualquier desperfecto que se detecte en los elementos de trabajo o instalaciones de la empresa, a efecto de evitar daños mayores.")
    li("10. Mantener en orden, higiene y aseo el lugar donde desempeñe sus labores.")
    li("11. Mantener siempre una excelente presencia y aspecto personal.")
    li("12. Cuidar con esmero, máquinas, implementos, equipos, instalaciones y útiles que se le entreguen para el desempeño de sus labores, los cuales deberá dejar limpios y/o guardados al término de su jornada. Ante cualquier destrucción, estos serán reparados y su arreglo o reemplazo será de cargo del trabajador. Esto no procederá cuando la destrucción de ellos sea a causa de su normal uso y desgaste.")
    li("13. Proceder a devolver todos los elementos puestos a su servicio, antes de cursar la firma del respectivo finiquito legal.")
    cl("C. Prohibiciones.")
    li("1. Consumo de Alcohol: Ingerir alcohol del inventario del local durante el turno o presentarse bajo sus efectos.")
    li("2. Descuadre de Caja: Diferencias injustificadas en la recaudación bajo su custodia.")
    li("3. Trato al Cliente: Discusiones, faltas de respeto o negligencia que afecte la imagen del local.")
    li("4. Seguridad: Dejar el local abierto o sin alarma de cierre, o, de manera negligente, se permita sustracciones de insumos, dinero o productos del local.")
    cl("", "El incumplimiento de alguna de las disposiciones indicadas, así como el incurrir en alguna de las prohibiciones, constituye incumplimiento grave de las obligaciones que le impone el contrato, siendo causal suficiente para poner término inmediato a éste.")
    vacio()
    cl("SEGUNDO: ", "El trabajador cumplirá una jornada de trabajo de {HORAS_SEMANALES} horas a la semana, distribuida de la siguiente forma: {DISTRIBUCION_JORNADA}. Sin perjuicio de lo anterior, el empleador podrá modificar la distribución y extensión de los turnos en función de las necesidades operacionales de la Empresa, siempre respetando el máximo semanal permitido. Con todo, el trabajador destinará una hora de colación no imputable a la jornada de trabajo.")
    vacio()
    cl("TERCERO: ", "El Empleador se compromete a remunerar al Trabajador en la forma que se indica:")
    li("1) Sueldo Base: $ {SUELDO_BASE} ({SUELDO_BASE_PALABRA}).")
    li("2) Asignación de Pérdida de Caja: {ASIGNACION_CAJA_TEXTO}.")
    li("3) Asignación de movilización: $ {ASIGNACION_MOVILIZACION} ({ASIGNACION_MOVILIZACION_PALABRA}).")
    li("4) Asignación de Colación: $ {ASIGNACION_COLACION} ({ASIGNACION_COLACION_PALABRA}).")
    vacio()
    cl("CUARTO: ", "{GRATIFICACION_TEXTO}. Las remuneraciones antes referidas quedarán afectas a los descuentos previsionales y tributarios que correspondan y a los demás que autorice la ley. El trabajador acepta y autoriza, desde ya, que pueda descontarse de su remuneración el tiempo no trabajado, sea por permisos, atrasos, faltas, rotura de implementos, u otros motivos, como también por anticipos de remuneración solicitados por él.")
    vacio()
    cl("QUINTO: Confidencialidad. ", "Prohibición absoluta de divulgar recetas de coctelería, bases de datos de clientes o cifras de venta del local. El trabajador se obliga a no entregar, revelar, divulgar ni comunicar a ninguna persona, salvo a sus superiores jerárquicos o a la administración de {RAZON_SOCIAL}, cualquier información, antecedente, cifra o dato relativos a las actividades comerciales y/o financieras de {RAZON_SOCIAL} y/o de empresas relacionadas comercialmente a ésta (clientes, proveedores, relacionados comerciales, etc.), a las cuales pudiere tener acceso de acuerdo al desarrollo de su cargo. La infracción a esta norma supone incumplimiento grave de las obligaciones que impone el contrato.")
    vacio()
    cl("SEXTO: ", "La duración de este contrato será {TIPO_CONTRATO} ({FECHA_TERMINO_CONTRATO}), rigiendo para su término las disposiciones establecidas en el Código del Trabajo.")
    vacio()
    cl("SÉPTIMO: ", "Se entienden incorporadas al presente contrato todas las disposiciones legales que se dicten con posterioridad a la fecha de suscripción y que tengan relación con él.")
    vacio()
    cl("OCTAVO: ", "Se deja constancia que el trabajador ingresó a prestar servicios para el empleador con fecha {FECHA_INICIO_CONTRATO}.")
    vacio()
    cl("NOVENO: ", "El trabajador podrá hacer uso de su feriado legal anual cuando le corresponda según la ley. Sin embargo, el empleador se reserva el derecho de establecer la época en que ello resulte conveniente, habida consideración de las necesidades del servicio de su giro.")
    vacio()
    cl("DÉCIMO: ", "Toda modificación que se introduzca al presente contrato o a su anexo deberá constar por escrito, a su dorso o en una hoja de prolongación colocada a continuación, y deberá estar firmada por el trabajador y el empleador.")
    vacio()
    cl("DÉCIMO PRIMERO: ", "Las cartas de amonestación son el medio utilizado por el empleador para comunicar al trabajador los incumplimientos en que ha incurrido, los cuales, de persistir, dan derecho al empleador para poner término al contrato de trabajo por incumplimiento grave de las obligaciones que impone el contrato o la causal que corresponda.")
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
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    build(OUT)
