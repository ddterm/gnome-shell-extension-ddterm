<?xml version="1.0"?>
<xsl:stylesheet
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    version="1.0">

    <xsl:output omit-xml-declaration="no" indent="yes"/>
    <xsl:strip-space elements="*"/>

    <xsl:template match="node()|@*">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="//object[@class = 'GtkStackPage']/property[@name = 'position']" />
    <xsl:template match="//object[@class = 'GtkScrolledWindow']/property[@name = 'shadow-type']" />
    <xsl:template match="//object[@class = 'GtkSpinButton']/property[@name = 'input-purpose']" />

</xsl:stylesheet>
