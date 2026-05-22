<?xml version="1.0"?>

<!--
SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

<xsl:stylesheet
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    version="1.0">

    <xsl:output omit-xml-declaration="no" indent="yes"/>

    <xsl:template match="node()|@*">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="//object[@class = 'GtkButton']/property[@name='can_default']"/>

    <xsl:template match="//template[@parent = 'GtkDialog']/child[@internal-child='vbox']/@internal-child">
        <xsl:attribute name="internal-child">content_area</xsl:attribute>
    </xsl:template>

</xsl:stylesheet>
