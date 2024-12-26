<?xml version="1.0" encoding="UTF-8"?>

<!--
SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-2.0-or-later
-->

<xsl:stylesheet
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    version="1.0">

    <xsl:param name="sourceFile"/>

    <xsl:output omit-xml-declaration="no" indent="yes"/>
    <xsl:strip-space elements="*"/>

    <xsl:template match="/">
        <xsl:apply-templates
            select="document($sourceFile)/comment()[contains(string(),'SPDX-FileCopyrightText:')]"
        />

        <xsl:apply-templates select="/*"/>
    </xsl:template>

    <xsl:template match="node()|@*">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*"/>
        </xsl:copy>
    </xsl:template>

</xsl:stylesheet>
