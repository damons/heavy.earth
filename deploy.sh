#!/bin/bash
(cd ./public; tar cvf - .)|(cd ../public/;tar xvf -)
