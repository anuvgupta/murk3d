#!/bin/bash
cd /tmp/claude-0/-home-user-murk3d/9cde92d2-c2f7-5109-8f3f-7a561ce56919/scratchpad
while [ ! -f batch159.done ]; do sleep 10; done
node view2.cjs '[{"name":"FO1_ghibli_issue","time":8.04,"pos":[-61.63,-17.94],"yaw":-3.028,"pitch":0.449,"sky":300,"clouds":"ghibli"},{"name":"FO2_ghibli_issue_p900","time":8.04,"pos":[-61.63,-17.94],"yaw":-3.028,"pitch":0.449,"sky":900,"clouds":"ghibli"},{"name":"FO3_ghibli_overlook_noon","time":12.5,"pos":[-86,-86],"yaw":-2.36,"pitch":0.45,"sky":600,"clouds":"ghibli"},{"name":"FO4_ghibli_golden","time":18.3,"pos":[-86,-86],"yaw":1.2,"pitch":0.35,"sky":300,"clouds":"ghibli"}]' > view_out160.txt 2>&1
echo DONE > batch160.done
