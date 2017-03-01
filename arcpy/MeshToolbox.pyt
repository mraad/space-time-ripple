#
# http://www.grantjenks.com/docs/sortedcontainers/introduction.html
# pip install sortedcontainers
#

import json
import os
import time
from datetime import timedelta
from math import *
from sortedcontainers import SortedDict

import arcpy


class Toolbox(object):
    def __init__(self):
        self.label = "MeshToolbox"
        self.alias = "MeshToolbox"
        self.tools = [MeshTool]


class MeshTool(object):
    def __init__(self):
        self.label = "Mesh Tool"
        self.description = "Mesh Tool"
        self.canRunInBackground = False

    def getParameterInfo(self):
        output_fl = arcpy.Parameter(
            name='extent',
            displayName='extent',
            direction='Output',
            datatype='Feature Layer',
            parameterType='Derived')
        output_fl.symbology = os.path.join(os.path.dirname(__file__), "Mesh.lyr")

        input_fc = arcpy.Parameter(
            name="input_fc",
            displayName="Input Feature Class",
            direction="Input",
            datatype="Table View",
            parameterType="Required")

        num_cells = arcpy.Parameter(
            name="num_cells",
            displayName="Num Cells",
            direction="Input",
            datatype="Long",
            parameterType="Required")
        num_cells.value = 100

        min_count = arcpy.Parameter(
            name="min_count",
            displayName="Min Count",
            direction="Input",
            datatype="Long",
            parameterType="Required")
        min_count.value = 1

        interval = arcpy.Parameter(
            name="interval",
            displayName="Interval",
            direction="Input",
            datatype="String",
            parameterType="Required")
        interval.value = "30m"

        path = arcpy.Parameter(
            name="path",
            displayName="JS Output File",
            direction="Input",
            datatype="String",
            parameterType="Required")
        path.value = os.path.join(os.path.dirname(__file__), "heat.js")

        return [output_fl, input_fc, num_cells, min_count, interval, path]

    def isLicensed(self):
        return True

    def updateParameters(self, parameters):
        return

    def updateMessages(self, parameters):
        return

    def create_mesh(self, extent_84, cells):
        arcpy.SetProgressorLabel("Creating mesh...")

        xmin = extent_84.XMin
        ymin = extent_84.YMin
        xmax = extent_84.XMax
        ymax = extent_84.YMax

        cols = cells
        rows = cells

        indicies = []

        for r0 in range(0, rows - 1):
            for c0 in range(0, cols - 1):
                r1 = r0 + 1
                c1 = c0 + 1
                tl = r0 * cols + c0
                tr = r0 * cols + c1
                bl = r1 * cols + c0
                br = r1 * cols + c1
                indicies.extend([tr, tl, bl, bl, br, tr])

        x_del = (xmax - xmin) / (cols - 1)
        y_del = (ymax - ymin) / (rows - 1)

        vertices = []
        y = ymax
        for r in range(0, rows):
            ofs = xmin
            for c in range(0, cols):
                vertices.extend([ofs, y, 100])
                ofs += x_del
            y -= y_del

        obj = {
            'rows': rows,
            'cols': cols,
            'xmin': xmin,
            'ymin': ymin,
            'xmax': xmax,
            'ymax': ymax,
            'length': cols * rows,
            'vertices': vertices,
            'indices': indicies
        }
        return obj

    def create_data(self, extent_84, sr_84, input_fc, cells, min_count, interval):
        int_text = interval[-1]
        int_nume = int(interval[:-1])
        if int_text == "s":
            seconds = timedelta(seconds=int_nume).total_seconds()
        elif int_text == "m":
            seconds = timedelta(minutes=int_nume).total_seconds()
        elif int_text == "h":
            seconds = timedelta(hours=int_nume).total_seconds()
        elif int_text == "d":
            seconds = timedelta(days=int_nume).total_seconds()
        elif int_text == "w":
            seconds = timedelta(weeks=int_nume).total_seconds()
        else:
            seconds = int(interval)

        time_dict = SortedDict()
        xmin = extent_84.XMin
        ymin = extent_84.YMin
        xmax = extent_84.XMax
        ymax = extent_84.YMax
        x_fac = cells / (xmax - xmin)
        y_fac = cells / (ymax - ymin)
        result = arcpy.management.GetCount(input_fc)
        max_range = int(result.getOutput(0))
        step_max = int(max(1, max_range / 100))
        step_cnt = 0
        arcpy.SetProgressor("step", "Searching...", 0, max_range, step_max)
        with arcpy.da.SearchCursor(input_fc, ["SHAPE@X", "SHAPE@Y", "pdate"], spatial_reference=sr_84) as cursor:
            for elem in cursor:
                step_cnt += 1
                arcpy.SetProgressorPosition(step_cnt)
                shape_x = elem[0]
                shape_y = elem[1]
                if xmin < shape_x < xmax and ymin < shape_y < ymax:
                    base_date_time = elem[2]
                    col = floor(x_fac * (shape_x - xmin))
                    row = cells - floor(y_fac * (shape_y - ymin))
                    tup = (row, col)
                    time_key = int(time.mktime(base_date_time.timetuple()) / seconds)
                    if time_key in time_dict:
                        time_val = time_dict[time_key]
                        if tup in time_val:
                            time_val[tup] += 1
                        else:
                            time_val[tup] = 1
                    else:
                        time_dict[time_key] = {tup: 1}
        arcpy.SetProgressor("default")
        arcpy.SetProgressorLabel("Creating data...")
        p_n = 0
        p_mu = 0.0
        p_m2 = 0.0
        data = []
        for tk, tv in time_dict.items():
            points = []
            for pk, p in tv.items():
                if p >= min_count:
                    row, col = pk
                    points.append({"r": row, "c": col, "p": p, "w": 1.0})
                    p_n += 1
                    delta = p - p_mu
                    p_mu += delta / p_n
                    delta2 = p - p_mu
                    p_m2 += delta * delta2
            if points:
                date_text = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(tk * seconds))
                data.append({"datetime": date_text, "points": points})
        s2 = p_m2 / (p_n - 1) if p_n > 1 else 0.0
        sd = sqrt(s2)
        p_min = p_mu - sd
        p_max = p_mu + sd
        p_del = p_max - p_min if p_max > p_min else 1.0
        arcpy.SetProgressorLabel("Normalizing data...")
        for elem in data:
            for point in elem["points"]:
                p = point["p"]
                if p < p_min:
                    w = 0.2
                elif p > p_max:
                    w = 1.0
                else:
                    w = 0.2 + 0.8 * (p - p_min) / p_del
                point["w"] = w
        return {"data": data, "min": p_min, "max": p_max, "mean": p_mu, "stddev": sd}

    def execute(self, parameters, messages):
        input_fc = parameters[1].value
        num_cells = parameters[2].value
        min_count = parameters[3].value
        interval = parameters[4].value
        output_file = parameters[5].value

        sr_84 = arcpy.SpatialReference(4326)

        if hasattr(arcpy, "mapping"):
            map_doc = arcpy.mapping.MapDocument('CURRENT')
            df = arcpy.mapping.ListDataFrames(map_doc)[0]
            extent_84 = df.extent.projectAs(sr_84)
        else:
            gis_project = arcpy.mp.ArcGISProject('CURRENT')
            map_frame = gis_project.listMaps()[0]
            extent_84 = map_frame.defaultCamera.getExtent().projectAs(sr_84)

        mesh = self.create_mesh(extent_84, num_cells)

        data = self.create_data(extent_84, sr_84, input_fc, num_cells - 1, min_count, interval)

        arcpy.SetProgressorLabel("Saving JS...")
        obj = {"mesh": mesh, "data": data}
        with open(output_file, "w") as text_file:
            text_file.write("define(")
            json.dump(obj, text_file)
            text_file.write(");")

        out_nm = "Mesh"
        ws = "in_memory"
        fc = ws + "/" + out_nm

        if arcpy.Exists(fc):
            arcpy.management.Delete(fc)

        arcpy.SetProgressorLabel("Creating Mesh FeatureClass...")
        arcpy.management.CreateFeatureclass(ws, out_nm, 'POLYGON',
                                            spatial_reference=sr_84,
                                            has_m='DISABLED',
                                            has_z='DISABLED')
        with arcpy.da.InsertCursor(fc, ["SHAPE@"]) as cursor:
            v = mesh["vertices"]
            i = mesh["indices"]
            idx_len = len(i)
            idx = 0
            while idx < idx_len:
                ii = i[idx] * 3
                jj = i[idx + 1] * 3
                kk = i[idx + 2] * 3
                ix = v[ii]
                iy = v[ii + 1]
                jx = v[jj]
                jy = v[jj + 1]
                kx = v[kk]
                ky = v[kk + 1]
                shape = [(ix, iy), (jx, jy), (kx, ky)]
                cursor.insertRow([shape])
                idx += 3

        parameters[0].value = fc
