---
title:  "PVRT Research Group"
layout: archive
permalink: /Group/
author_profile: true
comments: false
classes: wide
header:
  overlay_image: /assets/images/BG.png
  overlay_filter: 0.5  
---

## People:
### Group Leader: 
Dr. Roberto Peverati - [email](mailto:rpeverati@fit.edu)

### Graduate Students: 
Pierpaolo Morgante - [email](mailto:pmorgante2017@go.fit.edu)

We DO have open positions for graduate and undergraduate students. If you are a prospective student with a strong background in computational/theoretical chemistry interested in joining the PhD program in chemistry at Florida Tech, feel free to contact Dr. Peverati for details. Also, if you are a local undergraduate in search of a research project, and are interested in both chemistry and programming, please come visit us in OPS 333.
We DO NOT have open positions for post-docs at the moment.

## Machines:
### Group Cluster (Carbon):
TOTAL: 104 cores, 160GB RAM, in 4 nodes and 1 headnode:
- headnode: AMD Ryzen 7 2700x, 8c, 16GB RAM, Purchased: Aug 2018
- *node1*: 2xAMD Epyc 7281, Total: 32c, 64GB RAM, Purchased: Aug 2018
- *node2*: 2xAMD Epyc 7281, Total: 32c, 64GB RAM, Purchased: Aug 2018
- *nodeA*: AMD Ryzen Threadripper 1950x, 16c, 16GB RAM, Built: Dec 2018
- *nodeB*: AMD Ryzen Threadripper 1950x, 16c, 16GB RAM, Built: Dec 2018

### Workstations:
- *Hydrogen*: 2x Intel 5630v3, Total: 20c, 64GB RAM, Purchased: Sep 2016
- *Helium*: 2x Intel 5620v3, Total: 16c, 32GB RAM, Purchased: Oct 2016
- *Lithium*: 2x Intel 5620v3, Total: 16c, 32GB RAM, Purchased: Jan 2017
- *Beryllium*: AMD Ryzen Threadripper 1950x, 16c, 32GB RAM, Built: Jun 2018

If you are a group member that has access to any of these machines, please use this internal document to record your usage.
Note: In all our machines hyperthreading is turned OFF by default (our own benchmarks indicate that is convenient to do so).

### Florida Tech Computational Facilities:
- [Blueshark](https://services.fit.edu/it_faq/content/39/350/en/what-is-the-blueshark-cluster.html)

Note: On all FIT shared machines hyperthreading is turned ON, which means that for proper efficiency for quantum chemistry calculations, we should request twice the amount of threads than those used effectively by the QC engine (Gaussian, Q-Chem), and voluntarily leave half of them empty. A good strategy is to request an entire node in the submission script (12 threads on Blueshark), and use only half of its threads in the QC engine (Nproc=6 or -nt 6).